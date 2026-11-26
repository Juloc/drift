using Drift.Race;
using Drift.Relay;
using Xunit;

namespace Drift.Tests;

public class TandemMatchTests
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
        public FakeTime Time = new(); public WorldRelay Relay; public FakeBest Best = new(); public TandemMatches Matches; double now;
        public Rig()
        {
            Relay = new WorldRelay(Time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 999, FramesPerSecondPerAddress = 99999, HalfX = 5000, HalfZ = 5000 }, new Random(1));
            Matches = new TandemMatches(Best, 0, roundSeconds: 6, countdown: 1, pause: 1, clock: () => now); Matches.Follow(Relay);
        }
        public (Session S, TextPeer P, Guid Id) Add(string name, bool guest = false)
        {
            var p = new TextPeer(); var s = Relay.Join(p, "addr" + name, 0)!; var id = Guid.NewGuid();
            Matches.Join(s, id, name, guest, 0);
            return (s, p, id);
        }
        /// <summary>A person in a private world (the link of a guest round: the relay's `worldKey`); the match only pairs people of the same world.</summary>
        public (Session S, TextPeer P, Guid Id) AddIn(string name, string worldKey)
        {
            var p = new TextPeer(); var s = Relay.Join(p, "addr" + name, 0, worldKey: worldKey)!; var id = Guid.NewGuid();
            Matches.Join(s, id, name, true, 0);
            return (s, p, id);
        }
        public void Say(Session s, string json) => Matches.OnText(s, json);
        /// <summary>Both cars drift side by side (A a little ahead) for `seconds`, 15 poses a second, the clock and the match ticking.</summary>
        public void Drive((Session S, TextPeer P, Guid Id) a, (Session S, TextPeer P, Guid Id) b, double seconds, double aheadA)
        {
            for (var i = 0; i < (int)(seconds * 15); i++)
            {
                Time.Advance(1.0 / 15); now += 1.0 / 15;
                var z = (i + 1) * 22 / 15.0;
                Relay.OnMessage(a.S, Pose(0, z + aheadA, 22, 0.5)); Relay.OnMessage(b.S, Pose(5, z, 22, 0.5));
                if (i % 4 == 0) Matches.Tick();
            }
        }
    }

    [Fact]
    public void An_invitation_is_accepted_and_two_rounds_run_with_swapped_roles_and_a_result()
    {
        var r = new Rig(); var a = r.Add("a"); var b = r.Add("b");
        r.Say(a.S, $"{{\"t\":\"tandem.invite\",\"with\":{b.S.Id}}}");
        Assert.Equal((int)a.S.Id, b.P.Last("tandem.invite")!.Value.GetProperty("from").GetInt32());
        Assert.NotNull(a.P.Last("tandem.sent"));
        r.Say(b.S, "{\"t\":\"tandem.accept\"}");
        Assert.Equal("countdown", b.P.Last("tandem.run")!.Value.GetProperty("phase").GetString());
        r.Drive(a, b, 2.5, aheadA: 6);   // the countdown, then into round 1: A leads
        Assert.Equal("lead", a.P.Last("tandem.run")!.Value.GetProperty("role").GetString());
        Assert.Equal("chase", b.P.Last("tandem.run")!.Value.GetProperty("role").GetString());
        r.Drive(a, b, 6, aheadA: 6);     // the rest of round 1, the pause: now B is to lead
        Assert.Contains(a.P.Last("tandem.run")!.Value.GetProperty("phase").GetString(), new[] { "swap", "round2" });
        r.Drive(a, b, 8, aheadA: -6);    // round 2: B is ahead
        var res = a.P.Last("tandem.result")!.Value;
        Assert.True(res.GetProperty("total").GetInt32() > 50);
        Assert.Equal("b", res.GetProperty("partner").GetString());
        Assert.InRange(res.GetProperty("total").GetInt32() - (res.GetProperty("mine")[0].GetInt32() + res.GetProperty("mine")[1].GetInt32() + res.GetProperty("theirs")[0].GetInt32() + res.GetProperty("theirs")[1].GetInt32()), -2, 2);   // (four rounded parts against the rounded sum)
        Assert.Null(r.Matches.PhaseOf(a.S));
        Thread.Sleep(200);
        lock (r.Best.Written) Assert.Equal(2, r.Best.Written.Count(w => w.Kind == TandemRun.Board));   // both signed in: both boards
    }

    [Fact]
    public void Guests_play_but_write_nothing_and_a_busy_or_unknown_partner_is_refused()
    {
        var r = new Rig(); var a = r.Add("a", guest: true); var b = r.Add("b", guest: true); var c = r.Add("c");
        r.Say(a.S, "{\"t\":\"tandem.invite\",\"with\":99}");
        Assert.Equal("gone", a.P.Last("tandem.no")!.Value.GetProperty("why").GetString());
        r.Say(a.S, $"{{\"t\":\"tandem.invite\",\"with\":{b.S.Id}}}"); r.Say(b.S, "{\"t\":\"tandem.accept\"}");
        r.Say(c.S, $"{{\"t\":\"tandem.invite\",\"with\":{b.S.Id}}}");
        Assert.Equal("busy", c.P.Last("tandem.no")!.Value.GetProperty("why").GetString());
        r.Drive(a, b, 18, aheadA: 6);
        Assert.NotNull(a.P.Last("tandem.result"));
        Thread.Sleep(200);
        lock (r.Best.Written) Assert.DoesNotContain(r.Best.Written, w => w.Kind == TandemRun.Board);
    }

    [Fact]
    public void Tandem_works_in_a_private_round_by_link_and_never_pairs_people_of_different_worlds()
    {
        var r = new Rig(); var a = r.AddIn("a", "link-1"); var b = r.AddIn("b", "link-1"); var c = r.AddIn("c", "link-2"); var open = r.Add("o", guest: true);
        // across worlds: refused as if the other were not there (the public lobby and another link's round are other worlds)
        r.Say(a.S, $"{{\"t\":\"tandem.invite\",\"with\":{c.S.Id}}}");
        Assert.Equal("gone", a.P.Last("tandem.no")!.Value.GetProperty("why").GetString());
        r.Say(a.S, $"{{\"t\":\"tandem.invite\",\"with\":{open.S.Id}}}");
        Assert.Equal(2, a.P.Count("tandem.no"));
        // inside the round of one link: the invitation, the countdown, two rounds and the result as anywhere
        r.Say(a.S, $"{{\"t\":\"tandem.invite\",\"with\":{b.S.Id}}}");
        Assert.NotNull(b.P.Last("tandem.invite")); r.Say(b.S, "{\"t\":\"tandem.accept\"}");
        r.Drive(a, b, 18, aheadA: 6);
        Assert.NotNull(a.P.Last("tandem.result")); Assert.NotNull(b.P.Last("tandem.result"));
        Assert.Null(c.P.Last("tandem.run")); Assert.Null(open.P.Last("tandem.run"));
    }

    [Fact]
    public void Leaving_ends_the_match_and_a_declined_invitation_is_told()
    {
        var r = new Rig(); var a = r.Add("a"); var b = r.Add("b");
        r.Say(a.S, $"{{\"t\":\"tandem.invite\",\"with\":{b.S.Id}}}"); r.Say(b.S, "{\"t\":\"tandem.decline\"}");
        Assert.Equal("declined", a.P.Last("tandem.no")!.Value.GetProperty("why").GetString());
        r.Say(a.S, $"{{\"t\":\"tandem.invite\",\"with\":{b.S.Id}}}"); r.Say(b.S, "{\"t\":\"tandem.accept\"}");
        r.Matches.Leave(a.S);
        Assert.Equal("left", b.P.Last("tandem.end")!.Value.GetProperty("why").GetString());
        Assert.Null(r.Matches.PhaseOf(b.S));
    }
}
