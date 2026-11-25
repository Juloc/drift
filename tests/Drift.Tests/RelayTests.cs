using Drift.Relay;

namespace Drift.Tests;

sealed class FakeTime : TimeProvider
{
    long ticks;
    public override long TimestampFrequency => 1_000_000;
    public override long GetTimestamp() => ticks;
    public void Advance(double seconds) => ticks += (long)(seconds * 1_000_000);
}

sealed class FakePeer : IPeer
{
    public List<byte[]> Frames { get; } = [];
    public byte? Closed { get; private set; }
    public void Send(ReadOnlySpan<byte> frame) => Frames.Add(frame.ToArray());
    public void Close(byte reason) => Closed = reason;
    public byte[]? Last(byte type) => Frames.LastOrDefault(f => f[0] == type);
    public int Count(byte type) => Frames.Count(f => f[0] == type);
}

public class RelayTests
{
    static int nextSeq;

    /// <summary>A pose frame; the frame number counts up by itself (a frame must be newer than the last), or is given.</summary>
    static byte[] Pose(double x, double z, double h = 0, double vf = 0, int seq = -1, byte flags = 0)
    {
        var f = new byte[Wire.PoseLength];
        f[0] = Wire.Pose; f[1] = (byte)(seq >= 0 ? seq : ++nextSeq);
        Wire.Put16(f, 2, (int)Math.Round(x * 20)); Wire.Put16(f, 4, (int)Math.Round(z * 20));
        Wire.Put16(f, 6, (int)Math.Round(h / (2 * Math.PI) * 65536) & 0xFFFF); Wire.Put16(f, 8, (int)Math.Round(vf * 50));
        f[12] = flags;
        return f;
    }

    static (WorldRelay relay, FakeTime time) Make(RelayOptions? o = null) { var t = new FakeTime(); return (new WorldRelay(t, o, new Random(1)), t); }
    static (Session s, FakePeer p) Join(WorldRelay r, string addr = "a", int car = 0) { var p = new FakePeer(); var s = r.Join(p, addr, car); return (s!, p); }

    [Fact]
    public void A_visitor_gets_an_id_a_name_from_the_fixed_list_and_a_welcome()
    {
        var (r, _) = Make();
        var (s, p) = Join(r);
        var w = p.Last(Wire.Welcome)!;
        Assert.Equal(s.Id, w[1]);
        var parts = s.Name.Split(' ');
        Assert.Contains(parts[0], WorldRelay.Colours); Assert.Contains(parts[1], WorldRelay.Animals);
        Assert.Equal(WorldRelay.Colours[s.Hue / 2], parts[0]); // the colour word matches the car colour
        Assert.Equal(0, s.Id);
        Assert.Equal(1, Join(r, "b").s.Id);
    }

    [Fact]
    public void Names_in_one_world_are_unique()
    {
        var (r, _) = Make();
        var names = Enumerable.Range(0, 16).Select(i => Join(r, "addr" + i).s.Name).ToList();
        Assert.Equal(16, names.Distinct().Count());
    }

    [Fact]
    public void The_roster_goes_to_everyone_when_someone_comes_and_goes()
    {
        var (r, _) = Make();
        var (a, pa) = Join(r, "a"); var (b, pb) = Join(r, "b");
        Assert.Equal(2, pa.Last(Wire.Roster)![1]);
        r.Leave(b);
        Assert.Equal(1, pa.Last(Wire.Roster)![1]);
        Assert.Equal(1, r.Visitors);
    }

    [Fact]
    public void A_pose_reaches_the_others_but_not_the_sender()
    {
        var (r, _) = Make();
        var (a, pa) = Join(r, "a"); var (b, pb) = Join(r, "b");
        r.OnMessage(a, Pose(10, 20, 1, 15));
        r.Tick();
        var snap = pb.Last(Wire.Snapshot)!;
        Assert.Equal(1, snap[1]); Assert.Equal(a.Id, snap[4]);
        Assert.Equal(10 * 20, Wire.I16(snap, 5)); Assert.Equal(20 * 20, Wire.I16(snap, 7));
        Assert.Equal(0, pa.Count(Wire.Snapshot));
        Assert.Equal(4 + Wire.EntryLength, snap.Length);
    }

    [Fact]
    public void A_pose_outside_the_map_is_dropped_and_the_car_is_put_back()
    {
        var (r, t) = Make();
        var (a, pa) = Join(r); var (_, pb) = Join(r, "b");
        r.OnMessage(a, Pose(5, 5));
        t.Advance(0.07);
        r.OnMessage(a, Pose(500, 5));
        Assert.Equal(1, pa.Count(Wire.Fix));
        r.Tick();
        Assert.Equal(5 * 20, Wire.I16(pb.Last(Wire.Snapshot)!, 5));
    }

    [Fact]
    public void Too_fast_is_dropped()
    {
        var (r, _) = Make();
        var (a, pa) = Join(r);
        r.OnMessage(a, Pose(0, 0));
        r.OnMessage(a, Pose(0, 0, 0, 80)); // 80 m/s with a top of 35
        Assert.Equal(1, pa.Count(Wire.Fix));
    }

    [Fact]
    public void A_jump_is_dropped_but_an_honest_burst_after_a_lag_passes()
    {
        var (r, t) = Make();
        var (a, pa) = Join(r);
        r.OnMessage(a, Pose(-50, 0));
        t.Advance(0.07);
        r.OnMessage(a, Pose(50, 0)); // 100 m in 70 ms
        Assert.Equal(1, pa.Count(Wire.Fix));
        // a lag of 0.4 s, then 12 m at once: within 0.4 s * (1.25 * 35 + 3)
        t.Advance(0.4);
        r.OnMessage(a, Pose(-38, 0));
        Assert.Equal(1, pa.Count(Wire.Fix));
    }

    [Fact]
    public void Eight_violations_in_ten_seconds_end_the_connection()
    {
        var (r, t) = Make();
        var (a, pa) = Join(r);
        r.OnMessage(a, Pose(0, 0));
        for (int i = 0; i < 8; i++) { t.Advance(0.07); r.OnMessage(a, Pose(900, 0)); }
        Assert.Equal(Wire.ByeViolations, pa.Closed);
        Assert.Equal(0, r.Visitors);
    }

    [Fact]
    public void Spinning_faster_than_12_rad_per_second_is_dropped()
    {
        var (r, t) = Make();
        var (a, pa) = Join(r);
        r.OnMessage(a, Pose(0, 0, 0));
        t.Advance(0.07);
        r.OnMessage(a, Pose(0, 0, Math.PI)); // half a turn in 70 ms
        Assert.Equal(1, pa.Count(Wire.Fix));
    }

    [Fact]
    public void More_than_15_poses_a_second_are_dropped()
    {
        var (r, t) = Make();
        var (a, _) = Join(r); var (_, pb) = Join(r, "b");
        for (int i = 0; i < 100; i++) { r.OnMessage(a, Pose(0, 0, 0, 0)); t.Advance(0.005); } // 200 a second for half a second
        Assert.True(r.Stats.Accepted < 20, $"accepted {r.Stats.Accepted}");
        Assert.True(r.Stats.Rejected > 70);
    }

    [Fact]
    public void A_large_frame_ends_the_connection_and_junk_is_ignored()
    {
        var (r, _) = Make();
        var (a, pa) = Join(r);
        r.OnMessage(a, new byte[5]);
        r.OnMessage(a, [2, 3, 4]);
        Assert.Null(pa.Closed);
        r.OnMessage(a, new byte[65]);
        Assert.Equal(Wire.ByeLarge, pa.Closed);
    }

    [Fact]
    public void A_full_world_opens_a_second_one_and_visitors_do_not_see_across()
    {
        var (r, t) = Make(new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 });
        var all = Enumerable.Range(0, 17).Select(i => Join(r, "a" + i)).ToList();
        Assert.Equal(2, r.WorldCount);
        Assert.Equal(0, all[0].s.World); Assert.Equal(1, all[16].s.World);
        r.OnMessage(all[16].s, Pose(1, 1)); r.OnMessage(all[0].s, Pose(2, 2));
        r.Tick();
        Assert.Equal(0, all[16].p.Count(Wire.Snapshot)); // alone in world 1: nothing to send
        Assert.Equal(0, all[0].p.Last(Wire.Snapshot)?[1] ?? 0);
        r.Leave(all[16].s);
        Assert.Equal(1, r.WorldCount);
    }

    [Fact]
    public void The_relay_refuses_when_every_world_is_full()
    {
        var (r, _) = Make(new RelayOptions { MaxPerAddress = 999, JoinsPerMinutePerAddress = 999, MaxWorlds = 2, MaxPerWorld = 2 });
        for (int i = 0; i < 4; i++) Join(r, "a" + i);
        var p = new FakePeer();
        Assert.Null(r.Join(p, "late", 0));
        Assert.Equal(Wire.ByeFull, p.Closed);
    }

    [Fact]
    public void Per_address_limits_hold_connections_and_new_joins()
    {
        var (r, t) = Make();
        var kept = Enumerable.Range(0, 4).Select(_ => Join(r, "same")).ToList();
        var p = new FakePeer();
        Assert.Null(r.Join(p, "same", 0));
        Assert.Equal(Wire.ByeFull, p.Closed);
        Assert.NotNull(Join(r, "other").s);
        // joins per minute: leave and come back again and again
        var (r2, _) = Make();
        int ok = 0; for (int i = 0; i < 20; i++) { var q = new FakePeer(); var s = r2.Join(q, "x", 0); if (s != null) { ok++; r2.Leave(s); } }
        Assert.Equal(12, ok);
    }

    [Fact]
    public void An_address_shares_one_frame_budget()
    {
        var (r, t) = Make();
        var visitors = Enumerable.Range(0, 4).Select(_ => Join(r, "same").s).ToList();
        for (int round = 0; round < 40; round++) { foreach (var v in visitors) r.OnMessage(v, Pose(0, 0)); t.Advance(0.001); } // 4000 a second
        Assert.True(r.Stats.Accepted < 40, $"accepted {r.Stats.Accepted}");
    }

    [Fact]
    public void A_silent_visitor_is_dropped_after_30_seconds_and_a_parked_one_after_2_minutes()
    {
        var (r, t) = Make();
        var (silent, ps) = Join(r, "a"); var (parked, pp) = Join(r, "b"); var (driving, pd) = Join(r, "c");
        r.OnMessage(silent, Pose(0, 0)); r.OnMessage(parked, Pose(3, 3)); r.OnMessage(driving, Pose(0, 5));
        for (int sec = 1; sec <= 125; sec++)
        {
            t.Advance(1);
            if (sec % 2 == 0) { r.OnMessage(parked, Pose(3, 3)); }
            if (sec < 60) { } // silent says nothing
            r.OnMessage(driving, Pose(sec % 2 == 0 ? 0 : 3, 5, 0, 5)); // moves about every second
            r.Tick();
            if (sec == 29) Assert.Null(ps.Closed);
        }
        Assert.Equal(Wire.ByeSilent, ps.Closed);
        Assert.Equal(Wire.ByeIdle, pp.Closed);
        Assert.Null(pd.Closed);
        Assert.Equal(1, r.Visitors);
    }

    [Fact]
    public void Leaving_twice_does_no_harm_and_frees_the_address()
    {
        var (r, _) = Make();
        var (a, _) = Join(r, "same");
        r.Leave(a); r.Leave(a);
        for (int i = 0; i < 4; i++) Assert.NotNull(Join(r, "same").s);
    }

    [Fact]
    public void An_unknown_car_becomes_car_0_and_a_known_one_sets_the_speed_limit()
    {
        var (r, _) = Make();
        Assert.Equal(0, Join(r, "a", 99).s.Car);
        var (ox, pox) = Join(r, "b", 4); // top 28
        r.OnMessage(ox, Pose(0, 0));
        r.OnMessage(ox, Pose(0, 0, 0, 36)); // fine for car 0 (top 35 * 1.15 + 2 = 42), too fast for the Ox (34)
        Assert.Equal(1, pox.Count(Wire.Fix));
    }

    [Fact]
    public void Sixteen_cars_at_15_Hz_fit_the_numbers_of_the_design()
    {
        var (r, t) = Make();
        var vs = Enumerable.Range(0, 16).Select(i => Join(r, "n" + i).s).ToList();
        foreach (var v in vs) r.OnMessage(v, Pose(0, 0));
        long before = r.Stats.BytesOut;
        r.Tick();
        double perVisitor = (r.Stats.BytesOut - before) / 16.0;
        // 4 + 12 * 15 = 184 bytes of frame + 2 of WebSocket header
        Assert.InRange(perVisitor, 180, 190);
    }

    [Theory]
    [InlineData("203.0.113.5", "203.0.113.5")]
    [InlineData("::ffff:203.0.113.5", "203.0.113.5")]
    [InlineData("2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64")]
    [InlineData("2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64")]
    public void The_address_key_counts_an_ipv6_subscriber_by_its_64(string ip, string key) =>
        Assert.Equal(key, RelayEndpoint.AddressKey(System.Net.IPAddress.Parse(ip)));

    [Fact]
    public void Addresses_with_no_connection_are_forgotten_after_a_minute()
    {
        var (r, t) = Make();
        var (a, _) = Join(r, "x1"); var (b, _) = Join(r, "x2");
        r.Leave(a);
        Assert.Equal(2, r.KnownAddresses);
        for (var i = 0; i < 20; i++) { t.Advance(1); r.Tick(); }   // 20 s: kept
        Assert.Equal(2, r.KnownAddresses);
        for (var i = 0; i < 70; i++) { t.Advance(1); r.OnMessage(b, Pose(0, 0, 0, 0)); r.Tick(); }
        Assert.Equal(1, r.KnownAddresses);                         // the one with a connection stays
    }

    [Fact]
    public void A_flood_of_text_frames_ends_in_a_kick()
    {
        var (r, t) = Make();
        var (a, pa) = Join(r);
        for (var i = 0; i < 400; i++) { r.OnText(a); t.Advance(0.001); }
        Assert.Equal(Wire.ByeLarge, pa.Closed);
    }

    sealed class BrokenPeer : IPeer { public void Send(ReadOnlySpan<byte> frame) => throw new InvalidOperationException("socket gone"); public void Close(byte reason) { } }

    [Fact]
    public void A_socket_that_throws_when_sent_to_only_loses_its_own_place()
    {
        var (r, t) = Make();
        var (ok, pok) = Join(r, "a");
        var bad = r.Join(new BrokenPeer(), "b", 0);
        Assert.NotNull(bad);
        r.OnMessage(ok, Pose(1, 1)); r.OnMessage(bad!, Pose(2, 2));
        Assert.Null(r.TickGuarded());
        r.TickGuarded();
        Assert.Equal(1, r.Visitors);
        Assert.NotNull(pok.Last(Wire.Roster));
    }

    [Fact]
    public void A_way_through_a_wall_or_an_obstacle_is_refused()
    {
        var (r, t) = Make();
        // a wall along x = 10 from z = -20 to 20, and a post of radius 2 at (-10, 0)
        r.SetGeometry([10, -20, 10, 20], [(-10, 0, 2)]);
        var (a, pa) = Join(r);
        r.OnMessage(a, Pose(5, 0)); t.Advance(0.5);
        r.OnMessage(a, Pose(15, 0));                       // through the wall
        Assert.Equal(1, pa.Count(Wire.Fix));
        t.Advance(0.5);
        r.OnMessage(a, Pose(8, 6));                        // along the wall, not through it
        Assert.Equal(1, pa.Count(Wire.Fix));
        t.Advance(0.5);
        r.OnMessage(a, Pose(-10, 6)); t.Advance(0.5);      // across the wall's end, beside the post
        Assert.Equal(1, pa.Count(Wire.Fix));
        r.OnMessage(a, Pose(-10, -6));                     // straight through the post
        Assert.Equal(2, pa.Count(Wire.Fix));
    }

    [Fact]
    public void A_frame_that_is_not_newer_than_the_last_is_dropped()
    {
        var (r, t) = Make();
        var (a, _) = Join(r); var (_, pb) = Join(r, "b");
        r.OnMessage(a, Pose(1, 1, 0, 0, 10));
        t.Advance(0.5);
        r.OnMessage(a, Pose(2, 2, 0, 0, 10));              // the same number again: a replay
        r.OnMessage(a, Pose(3, 3, 0, 0, 9));               // an older one
        r.Tick();
        Assert.Equal(1 * 20, Wire.I16(pb.Last(Wire.Snapshot)!, 5));
        t.Advance(0.5);
        r.OnMessage(a, Pose(4, 4, 0, 0, 11)); r.Tick();    // a newer one is fine
        Assert.Equal(4 * 20, Wire.I16(pb.Last(Wire.Snapshot)!, 5));
        // the number wraps at 256: 11, 120, 200, 250, then 3 (9 ahead through the wrap)
        foreach (var n in new[] { 120, 200, 250, 3 }) { t.Advance(0.5); r.OnMessage(a, Pose(5, 5, 0, 0, n)); }
        r.Tick();
        Assert.Equal(5 * 20, Wire.I16(pb.Last(Wire.Snapshot)!, 5));
        t.Advance(0.5); r.OnMessage(a, Pose(6, 6, 0, 0, 250)); r.Tick();   // 247 "ahead": really an old frame
        Assert.Equal(5 * 20, Wire.I16(pb.Last(Wire.Snapshot)!, 5));
    }

    [Fact]
    public void A_claimed_speed_the_car_did_not_move_at_is_refused()
    {
        var (r, t) = Make();
        var (a, pa) = Join(r);
        r.OnMessage(a, Pose(0, 0, 0, 40)); t.Advance(0.3);
        r.OnMessage(a, Pose(0.1, 0, 0, 40));               // 40 m/s claimed, 10 cm moved in 0.3 s
        Assert.Equal(1, pa.Count(Wire.Fix));
        t.Advance(0.3);
        r.OnMessage(a, Pose(0.1 + 10, 0, 0, 40));          // a car really doing 30 to 40 m/s is fine
        Assert.Equal(1, pa.Count(Wire.Fix));
    }

    [Fact]
    public void DropAll_ends_every_connection_with_a_reason()
    {
        var (r, _) = Make();
        var (_, pa) = Join(r, "a"); var (_, pb) = Join(r, "b");
        r.DropAll(Wire.ByeSession);
        Assert.Equal(Wire.ByeSession, pa.Closed); Assert.Equal(Wire.ByeSession, pb.Closed);
        Assert.Equal(0, r.Visitors);
    }
}
