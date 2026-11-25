using System.Text.Json;
using Drift.Race;
using Drift.Relay;

namespace Drift.Tests;

/// <summary>Cars that crash with the game's own contact code (tools/make-collision-poses.mjs) are still believed by the relay: every pose is accepted, nobody is kicked.</summary>
public class CollisionRelayTests
{
    [Fact]
    public void Every_pose_of_cars_that_hit_walls_a_pole_and_each_other_passes_the_relays_checks_with_the_maps_walls()
    {
        var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(Repo.Root, "tests", "vectors", "collision-poses.json")));
        var track = RaceTrack.FromJson(RaceTrackTests.MapJson);
        var hits = 0;
        foreach (var sc in doc.RootElement.GetProperty("scenarios").EnumerateObject())
        {
            var time = new FakeTime();
            var relay = new WorldRelay(time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 99, FramesPerSecondPerAddress = 99999 }, new Random(1));
            relay.SetGeometry(track.Segments, track.Obstacles);
            var cars = sc.Value.GetProperty("cars").EnumerateArray().Select((c, i) => (Session: relay.Join(new FakePeer(), "a" + i, c.GetProperty("car").GetInt32())!, Poses: c.GetProperty("poses").EnumerateArray().ToList())).ToList();
            byte seq = 0;
            for (var i = 0; i < cars.Min(c => c.Poses.Count); i++)
            {
                time.Advance(1.0 / 15);
                foreach (var (s, poses) in cars)
                {
                    var p = poses[i]; var f = new byte[Wire.PoseLength];
                    f[0] = Wire.Pose; f[1] = ++seq;
                    Wire.Put16(f, 2, (int)Math.Round(p.GetProperty("x").GetDouble() * 20)); Wire.Put16(f, 4, (int)Math.Round(p.GetProperty("z").GetDouble() * 20));
                    Wire.Put16(f, 6, (int)Math.Round(p.GetProperty("h").GetDouble() / (2 * Math.PI) * 65536) & 0xFFFF); Wire.Put16(f, 8, (int)Math.Round(p.GetProperty("vf").GetDouble() * 50));
                    f[10] = (byte)(sbyte)Math.Round(p.GetProperty("beta").GetDouble() / (Math.PI / 128)); f[12] = (byte)p.GetProperty("flags").GetInt32();
                    if (f[12] != 0) hits++;
                    relay.OnMessage(s, f);
                }
            }
            Assert.True(relay.Stats.Rejected == 0, $"{sc.Name}: {relay.Stats.Rejected} poses refused");
            Assert.Equal(cars.Count, relay.Visitors);   // nobody was kicked
            Assert.Equal((long)cars.Min(c => c.Poses.Count) * cars.Count, relay.Stats.Accepted);
        }
        Assert.True(hits > 40, $"the scenarios do contain hits ({hits})");
    }
}
