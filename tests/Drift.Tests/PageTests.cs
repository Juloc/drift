using System.Net;
using System.Text.RegularExpressions;

namespace Drift.Tests;

public class PageTests
{
    [Theory]
    [InlineData("/play/", "text/html")]
    [InlineData("/play/boot.js", "text/javascript")]
    [InlineData("/play/main.js", "text/javascript")]
    [InlineData("/play/net/world.js", "text/javascript")]
    [InlineData("/play/data/cars.json", "application/json")]
    [InlineData("/play/data/maps/06-touge.json", "application/json")]
    [InlineData("/play/lab-sim.html", "text/html")]
    [InlineData("/play/lab-sim.js", "text/javascript")]
    [InlineData("/play/sim/sim2.js", "text/javascript")]
    [InlineData("/vendor/three/three.module.js", "text/javascript")]
    [InlineData("/vendor/three/three.core.js", "text/javascript")]
    public async Task The_game_page_and_its_files_are_served_with_the_security_headers(string url, string type)
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var r = await app.Http().GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.StartsWith(type, r.Content.Headers.ContentType!.ToString());
        Assert.Equal("nosniff", r.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Contains("script-src 'self'", r.Headers.GetValues("Content-Security-Policy").Single());
    }

    [Fact]
    public async Task The_game_page_fits_the_content_policy_no_inline_script_no_style_attribute_no_handler()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var html = await app.Http().GetStringAsync("/play/");
        foreach (Match m in Regex.Matches(html, "<script[^>]*>", RegexOptions.IgnoreCase)) Assert.Contains("src=", m.Value);
        Assert.DoesNotContain("importmap", html);
        Assert.DoesNotMatch(@"\sstyle\s*=", html);
        Assert.DoesNotMatch(@"\son[a-z]+\s*=", html);
        Assert.DoesNotContain("innerHTML", await app.Http().GetStringAsync("/play/main.js"));
        // the page does not name any outside server
        Assert.DoesNotMatch(@"(href|src)\s*=\s*""https?://", html);
    }

    [Fact]
    public async Task The_app_page_still_loads_and_the_service_worker_keeps_only_the_shell()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/")).StatusCode);
        var sw = await c.GetStringAsync("/sw.js");
        Assert.DoesNotContain("/play", sw);   // the game is not part of the offline shell (SEC-08)
        Assert.DoesNotContain("/api", sw.Split("const SHELL")[1].Split('\n')[0]);
    }

    [Fact]
    public async Task Every_text_of_the_garage_exists_in_german_and_english()
    {
        string Keys(string lang) => string.Join("\n", Regex.Matches(File.ReadAllText(Path.Combine(Repo.Root, "src", "Drift", "wwwroot", "i18n", lang + ".js")), @"^\s*'([^']+)':", RegexOptions.Multiline).Select(m => m.Groups[1].Value).Order());
        Assert.Equal(Keys("en"), Keys("de"));
        // every t('...') key used by the pages is defined
        var defined = Keys("en").Split('\n').ToHashSet();
        var baseKeys = Regex.Matches(File.ReadAllText(Path.Combine(Repo.Root, "base", "ui", "i18n", "en.js")), @"^\s*'([^']+)':", RegexOptions.Multiline).Select(m => m.Groups[1].Value).ToHashSet();
        foreach (var file in new[] { "app.js", "games-admin.js" }) foreach (Match m in Regex.Matches(File.ReadAllText(Path.Combine(Repo.Root, "src", "Drift", "wwwroot", file)), @"\bt\('([a-zA-Z0-9_.]+[a-zA-Z0-9_])'")) Assert.True(defined.Contains(m.Groups[1].Value) || baseKeys.Contains(m.Groups[1].Value), m.Groups[1].Value);
        await Task.CompletedTask;
    }
}

internal static class Repo
{
    public static string Root { get; } = Find();
    private static string Find()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "Drift.slnx"))) return dir.FullName;
        throw new InvalidOperationException("Drift.slnx not found above " + AppContext.BaseDirectory);
    }
}
