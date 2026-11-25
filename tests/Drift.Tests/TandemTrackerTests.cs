using System.Text.Json;
using Drift.Race;
using Drift.Relay;

namespace Drift.Tests;

/// <summary>The server's tandem judgement in the lobby: two cars drive side by side on the relay's own clock and are told what they earn.</summary>
public class TandemTrackerTests
{
    static int seq;
    static byte[] Pose(double x, double z, double vf, double beta)
    {
        var f = new byte[Wire.PoseLength];
        f[0] = Wire.Pose; f[1] = (byte)(++seq);
        Wire.Put16(f, 2, (int)Math.Round(x * 20)); Wire.Put16(f, 4, (int)Math.Round(z * 20)); Wire.Put16(f, 6, 0); Wire.Put16(f, 8, (int)Math.Round(vf * 50));
        f[10] = (byte)(sbyte)Math.Round(beta / (Math.PI / 128));
        return f;
    }

    sealed class Rig
    {
        public FakeTime Time = new(); public WorldRelay Relay; public FakeBest Best = new(); public TandemTracker Tracker;
        public Rig() { Relay = new WorldRelay(Time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 999, FramesPerSecondPerAddress = 99999, HalfX = 5000, HalfZ = 5000 }, new Random(1)); Tracker = new TandemTracker(Best); Tracker.Follow(Relay); }
        public (Session S, TextPeer P) Add(string name, bool guest = false)
        {
            var p = new TextPeer(); var s = Relay.Join(p, "addr" + name, 0)!;
            Tracker.Join(s, Guid.NewGuid(), name, guest, 0);
            return (s, p);
        }
        /// <summary>Both cars drive on, 15 poses a second; each has its own sideways position and slip.</summary>
        public void Drive((Session S, TextPeer P) a, (Session S, TextPeer P) b, double seconds, double gap, double slipA = 0.5, double slipB = 0.5, double z0 = 0)
        {
            for (var i = 0; i < (int)(seconds * 15); i++)
            {
                Time.Advance(1.0 / 15);
                var z = z0 + (i + 1) * 22 / 15.0;
                Relay.OnMessage(a.S, Pose(0, z, 22, slipA));
                Relay.OnMessage(b.S, Pose(gap, z, 22, slipB));
            }
        }
    }

    [Fact]
    public void Two_cars_drifting_side_by_side_are_told_a_multiplier_and_opposite_roles()
    {
        var r = new Rig(); var a = r.Add("a"); var b = r.Add("b");
        r.Drive(a, b, 4, gap: 5);
        var ta = a.P.Last("tandem")!.Value; var tb = b.P.Last("tandem")!.Value;
        Assert.True(ta.GetProperty("on").GetBoolean() && tb.GetProperty("on").GetBoolean());
        Assert.InRange(ta.GetProperty("mult").GetDouble(), 1.1, 2.0);
        Assert.Equal(new[] { "chase", "lead" }, new[] { ta.GetProperty("role").GetString(), tb.GetProperty("role").GetString() }.Order().ToArray());
        Assert.True(a.P.Count("tandem") <= 4 * 4 + 2, "at most four messages a second");
        Assert.Equal(a.S.Id, tb.GetProperty("with").GetInt32());
    }

    [Fact]
    public void A_chain_that_ends_is_banked_told_and_written_to_the_board_for_a_signed_in_person_only()
    {
        var r = new Rig(); var a = r.Add("a"); var g = r.Add("guest", guest: true);
        r.Drive(a, g, 5, gap: 4);
        // the guest stops drifting: the chain ends after the grace time
        r.Drive(a, g, 3, gap: 4, slipB: 0.0, z0: 5 * 22);
        var bank = a.P.Last("tandem.bank");
        Assert.NotNull(bank);
        Assert.True(bank!.Value.GetProperty("points").GetInt32() > 50);
        Assert.NotNull(g.P.Last("tandem.bank"));   // the guest is told too ...
        var deadline = DateTime.UtcNow.AddSeconds(2);
        while (r.Best.Written.Count == 0 && DateTime.UtcNow < deadline) Thread.Sleep(20);
        Assert.Single(r.Best.Written);             // ... but only the signed-in person's best is written
        Assert.Equal(TandemTracker.Board, r.Best.Written[0].Kind);
        Assert.False(a.P.Last("tandem")!.Value.GetProperty("on").GetBoolean());
    }

    [Fact]
    public void Cars_far_apart_or_drifting_different_ways_get_nothing()
    {
        var r = new Rig(); var a = r.Add("a"); var b = r.Add("b");
        r.Drive(a, b, 3, gap: 30);
        Assert.Equal(0, a.P.Count("tandem"));
        r.Drive(a, b, 3, gap: 5, slipA: 0.5, slipB: -0.5, z0: 3 * 22);
        Assert.Equal(0, a.P.Count("tandem"));
        Assert.Null(r.Tracker.StateOf(a.S)?.Pending is > 0 ? "x" : null);
    }

    [Fact]
    public void A_car_that_leaves_is_forgotten_and_a_single_car_earns_nothing()
    {
        var r = new Rig(); var a = r.Add("a"); var b = r.Add("b");
        r.Drive(a, b, 2, gap: 5);
        r.Tracker.Leave(b.S);
        Assert.Null(r.Tracker.StateOf(b.S));
        var before = r.Tracker.StateOf(a.S)!.Value.Pending;
        for (var i = 0; i < 30; i++) { r.Time.Advance(1.0 / 15); r.Relay.OnMessage(a.S, Pose(0, 100 + i * 1.5, 22, 0.5)); }
        Assert.True(r.Tracker.StateOf(a.S)!.Value.Pending <= before + 1e-9 || r.Tracker.StateOf(a.S)!.Value.Banked > 0);
    }
}

public class TandemRunTests
{
    static TandemCar Car(double x, double z, double beta = 0.5) => new(x, z, 0, 22, beta);

    /// <summary>Runs the whole competition with A at (0,za) and B at (gap, zb): returns the run.</summary>
    static TandemRun Play(double gap, double zaLead, double zbLead, double betaA = 0.5, double betaB = 0.5, double round = 10)
    {
        var run = new TandemRun(round, 3, 4);
        run.Start(0);
        for (var t = 0.0; t < 3 + round + 4 + round + 1; t += 1.0 / 15)
        {
            // in the first round A leads (is ahead along z), in the second B leads
            var r1 = t < 3 + round + 2;
            run.Pose(0, Car(0, t * 22 + (r1 ? zaLead : zbLead), betaA)); run.Pose(1, Car(gap, t * 22 + (r1 ? zbLead : zaLead), betaB));
            run.Tick(t);
        }
        return run;
    }

    [Fact]
    public void A_good_pair_scores_in_both_rounds_and_the_chase_earns_less_than_the_lead_it_follows()
    {
        var run = Play(gap: 5, zaLead: 6, zbLead: 0);
        Assert.Equal(TandemRun.Phase.Done, run.Now);
        Assert.True(run.Points[0, 0] > 100 && run.Points[1, 1] > 100, "the leads earn in their own rounds");
        Assert.True(run.Points[1, 0] > 50 && run.Points[0, 1] > 50, "the chases earn too");
        Assert.True(run.Points[1, 0] < run.Points[0, 0], "a chase earns its quality's share of the same rate");
        Assert.Equal(run.Points[0, 0] + run.Points[0, 1] + run.Points[1, 0] + run.Points[1, 1], run.Total, 6);
    }

    [Fact]
    public void A_chase_that_is_ahead_of_the_lead_earns_nothing_and_a_far_chase_earns_nothing()
    {
        var wrong = Play(gap: 5, zaLead: 0, zbLead: 6);   // in round 1 B is ahead although A should lead
        Assert.True(wrong.Points[0, 0] > 100);            // A still earns its own slide
        Assert.Equal(0, wrong.Points[1, 0]);              // B, the "chase", is in front: nothing
        var far = Play(gap: 30, zaLead: 6, zbLead: 0);
        Assert.Equal(0, far.Points[1, 0]);
        Assert.True(far.Points[0, 0] > 100);
    }

    [Fact]
    public void Nothing_is_scored_without_a_slide_or_outside_a_round_and_the_phases_come_in_order()
    {
        var run = new TandemRun(5, 3, 2);
        run.Start(0);
        var seen = new List<string>();
        for (var t = 0.0; t < 20; t += 1.0 / 15) { run.Pose(0, Car(0, t * 22, 0.0)); run.Pose(1, Car(5, t * 22 - 6, 0.0)); seen.AddRange(run.Tick(t)); }
        Assert.Equal(["round1", "swap", "round2", "done"], seen);
        Assert.Equal(0, run.Total);
        Assert.Equal(TandemRole.None, run.RoleOf(0));
    }

    [Fact]
    public async Task The_pairs_score_goes_to_both_signed_in_drivers_and_not_to_a_guest()
    {
        var run = Play(gap: 5, zaLead: 6, zbLead: 0);
        var best = new FakeBest(); var p = Guid.NewGuid(); var g = Guid.NewGuid();
        await run.RecordAsync(best, (p, false, 0), (g, true, 1));
        Assert.Single(best.Written);
        Assert.Equal((p, TandemRun.Board, (int)Math.Round(run.Total)), best.Written[0]);
        var early = new TandemRun(5); early.Start(0);
        await early.RecordAsync(best, (p, false, 0), (g, false, 1));   // not finished: nothing
        Assert.Single(best.Written);
    }
}
