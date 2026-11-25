using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Drift.Garage;

namespace Drift.Tests;

public class GarageTests
{
    [Fact]
    public async Task The_garage_needs_a_session()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/garage")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(new HttpRequestMessage(HttpMethod.Put, "/api/garage") { Content = JsonContent.Create(new { car = 1, colour = 3 }) })).StatusCode); // the header and the origin of the app's own page matter first
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", "drift_sid=nonsense", new { car = 1, colour = 3 }))).StatusCode);
    }

    static void AssertNeutral(string name, int colour)
    {
        var parts = name.Split(' ');
        Assert.Equal(2, parts.Length);
        Assert.Equal(Drift.Relay.WorldRelay.Colours[colour / 2 % Drift.Relay.WorldRelay.Colours.Length], parts[0]);
        Assert.Contains(parts[1], Drift.Relay.WorldRelay.Animals);
        Assert.DoesNotContain("jul", name, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void The_neutral_name_is_the_same_for_one_person_every_time()
    {
        var id = Guid.NewGuid();
        Assert.Equal(GarageStore.NeutralName(id, 6), GarageStore.NeutralName(id, 6));
        Assert.Equal(GarageStore.NeutralName(id, 6).Split(' ')[1], GarageStore.NeutralName(id, 20).Split(' ')[1]); // the animal follows the person, the colour word the car
        Assert.Equal("Nick", GarageStore.DisplayName(id, new Profile(0, 6, "Nick")));
    }

    [Fact]
    public async Task A_new_person_gets_defaults_and_a_saved_choice_comes_back()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        var cookie = await app.SignedInAsync(c);
        var first = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/garage", cookie)));
        Assert.Equal(0, first.GetProperty("car").GetInt32());
        AssertNeutral(first.GetProperty("name").GetString()!, first.GetProperty("colour").GetInt32()); // no nickname: a neutral name, never the account name "jul"
        Assert.Equal(5, first.GetProperty("cars").GetArrayLength());

        var put = await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 3, colour = 17, nick = "  Sky Fox " }));
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var again = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/garage", cookie)));
        Assert.Equal(3, again.GetProperty("car").GetInt32());
        Assert.Equal(17, again.GetProperty("colour").GetInt32());
        Assert.Equal("Sky Fox", again.GetProperty("nick").GetString());
        Assert.Equal("Sky Fox", again.GetProperty("name").GetString());

        // an empty nickname goes back to the account's name
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 3, colour = 17, nick = "" }));
        var cleared = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/garage", cookie)));
        AssertNeutral(cleared.GetProperty("name").GetString()!, 17);
    }

    [Theory]
    [InlineData(9, 3, "Ok", "car", "out_of_range")]
    [InlineData(-1, 3, "Ok", "car", "out_of_range")]
    [InlineData(1, 27, "Ok", "colour", "out_of_range")]
    [InlineData(1, 3, "x", "nick", "too_short")]
    [InlineData(1, 3, "this nickname is far too long", "nick", "too_long")]
    [InlineData(1, 3, "<b>hi</b>", "nick", "invalid")]
    [InlineData(1, 3, "a\"onload=1", "nick", "invalid")]
    [InlineData(1, 3, "-dash first", "nick", "invalid")]
    public async Task A_wrong_choice_is_refused_with_the_field_and_a_code(int car, int colour, string nick, string field, string code)
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        var cookie = await app.SignedInAsync(c);
        var r = await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car, colour, nick }));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        var body = await TestApp.Json(r);
        Assert.Equal(code, body.GetProperty("fields").GetProperty(field).GetString());
    }

    [Fact]
    public async Task The_store_names_the_owner_so_nobody_reads_the_profile_of_somebody_else()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        await app.SignedInAsync(app.Http()); // runs the migrations
        var store = new GarageStore(db.Data);
        var a = Guid.NewGuid();
        await using (var cmd = db.Data.CreateCommand("insert into users (id, name, password_hash, totp_secret, roles) values ($1, 'a', 'x', 'x', '{member}'), ($2, 'b', 'x', 'x', '{member}')") ) { cmd.Parameters.AddWithValue(a); var b = Guid.NewGuid(); cmd.Parameters.AddWithValue(b); await cmd.ExecuteNonQueryAsync(); await store.SaveAsync(a, new Profile(4, 5, "Alpha")); Assert.Equal(new Profile(4, 5, "Alpha"), await store.GetAsync(a)); Assert.Null((await store.GetAsync(b)).Nick); Assert.Equal(0, (await store.GetAsync(b)).Car); }
    }

    [Fact]
    public async Task The_table_refuses_what_the_api_would_refuse()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        await app.SignedInAsync(app.Http());
        var id = await db.Data.CreateCommand("select id from users limit 1").ExecuteScalarAsync();
        foreach (var (car, colour, nick) in new (int, int, string?)[] { (5, 1, null), (1, 27, null), (1, 1, "x") })
        {
            await using var cmd = db.Data.CreateCommand("insert into drift_profile (user_id, car_id, colour, nick) values ($1, $2, $3, $4)");
            cmd.Parameters.AddWithValue(id!); cmd.Parameters.AddWithValue((short)car); cmd.Parameters.AddWithValue((short)colour); cmd.Parameters.AddWithValue((object?)nick ?? DBNull.Value);
            await Assert.ThrowsAsync<Npgsql.PostgresException>(() => cmd.ExecuteNonQueryAsync());
        }
    }

    [Fact]
    public async Task Underglow_is_off_by_default_saved_as_a_hue_and_checked()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        var cookie = await app.SignedInAsync(c);
        var first = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/garage", cookie)));
        Assert.False(first.TryGetProperty("glow", out var off) && off.ValueKind != JsonValueKind.Null);   // off: left out or null
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 1, colour = 2, glow = 17 }))).StatusCode);
        Assert.Equal(17, (await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/garage", cookie)))).GetProperty("glow").GetInt32());
        foreach (var bad in new[] { 24, -1, 99 })
        {
            var r = await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 1, colour = 2, glow = bad }));
            Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
            Assert.Equal("out_of_range", (await TestApp.Json(r)).GetProperty("fields").GetProperty("glow").GetString());
        }
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 1, colour = 2 }))).StatusCode);   // glow left out: off again
        Assert.False((await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/garage", cookie)))).TryGetProperty("glow", out var again) && again.ValueKind != JsonValueKind.Null);
        await using var cmd = db.Data.CreateCommand("update drift_profile set glow = 24");
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => cmd.ExecuteNonQueryAsync());   // the table refuses it too
    }

    [Fact]
    public void The_default_colour_is_white_and_a_valid_paint()
    {
        Assert.All(Enumerable.Range(0, 20).Select(_ => GarageStore.DefaultColour(Guid.NewGuid())), h => Assert.Equal(24, h));
    }

    [Fact]
    public async Task White_black_and_silver_are_paints_24_to_26_and_nothing_beyond_is_accepted()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        var cookie = await app.SignedInAsync(c);
        foreach (var paint in new[] { 24, 25, 26, 7 })
        {
            Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 0, colour = paint }))).StatusCode);
            Assert.Equal(paint, (await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/garage", cookie)))).GetProperty("colour").GetInt32());
        }
        Assert.NotEqual(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 0, colour = 27 }))).StatusCode);
    }
}
