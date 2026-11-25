// Bridges one ASP.NET WebSocket path to a WorldRelay: the origin check, a bounded outgoing queue that drops the
// oldest frame (a slow phone never makes the relay wait), the receive loop and the 15 Hz timer.
// The website's own small server can take WorldRelay.cs and this file as they are and call Map once.
using System.Net.WebSockets;
using System.Threading.Channels;

namespace Drift.Relay;

public static class RelayEndpoint
{
    /// <param name="addressOf">The visitor's address as the limits should see it; behind a proxy this must be the forwarded client address.</param>
    public static void Map(WebApplication app, WorldRelay relay, string path = "/ws", Func<HttpContext, string>? addressOf = null)
    {
        addressOf ??= c => c.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
        app.Map(path, async ctx =>
        {
            int.TryParse(ctx.Request.Query["car"], out var car);
            await Serve(ctx, relay, addressOf(ctx), car);
        });
        RunTicker(relay, app.Lifetime.ApplicationStopping);
    }

    /// <summary>The 15 Hz timer of a relay: starts once, ends with <paramref name="stop"/>.</summary>
    public static void RunTicker(WorldRelay relay, CancellationToken stop) => _ = Task.Run(async () =>
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1.0 / 15));
        try { while (await timer.WaitForNextTickAsync(stop)) relay.Tick(); } catch (OperationCanceledException) { }
    });

    /// <summary>
    /// One visitor's whole connection: the origin check, accepting the socket, joining the relay, the receive loop.
    /// <paramref name="stillValid"/> (optional) is asked every 30 s; when it says no the visitor is dropped (a session that ended).
    /// <paramref name="joined"/> (optional) gets the session once the visitor is in, and <paramref name="left"/> when it is out.
    /// </summary>
    public static async Task Serve(HttpContext ctx, WorldRelay relay, string address, int car, string? name = null, int? hue = null,
        Func<Task<bool>>? stillValid = null, Action<Session>? joined = null, Action<Session>? left = null, TimeSpan? checkEvery = null, Action<Session, string>? onText = null)
    {
        if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
        // a page of another site must not be able to drive through this socket
        var origin = ctx.Request.Headers.Origin.ToString();
        if (origin.Length > 0 && !(Uri.TryCreate(origin, UriKind.Absolute, out var u) && string.Equals(u.Authority, ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase)))
        { ctx.Response.StatusCode = 403; return; }
        using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
        var peer = new SocketPeer(ws);
        var session = relay.Join(peer, address, car, name, hue);
        if (session is null) { await peer.Finish(); return; }
        joined?.Invoke(session);
        var sender = peer.Run();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ctx.RequestAborted);
        var watcher = stillValid is null ? Task.CompletedTask : Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(checkEvery ?? TimeSpan.FromSeconds(30));
            try
            {
                while (await timer.WaitForNextTickAsync(cts.Token))
                    if (!await stillValid()) { relay.Drop(session, Wire.ByeSession); break; }
            }
            catch (OperationCanceledException) { }
            catch (Exception) { relay.Drop(session, Wire.ByeSession); } // a check that fails never keeps anybody in
        });
        var buf = new byte[1024]; // text frames (small JSON) may be longer than a pose; the relay itself refuses binary frames over its limit
        try
        {
            while (ws.State == WebSocketState.Open && !peer.Closing)
            {
                var r = await ws.ReceiveAsync(buf, cts.Token);
                if (r.MessageType == WebSocketMessageType.Close) break;
                if (!r.EndOfMessage) { relay.OnOversize(session); break; }
                if (r.MessageType == WebSocketMessageType.Text) { if (r.Count <= 512) onText?.Invoke(session, System.Text.Encoding.UTF8.GetString(buf, 0, r.Count)); continue; }
                relay.OnMessage(session, buf.AsSpan(0, r.Count));
            }
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException) { }
        finally { cts.Cancel(); relay.Leave(session); left?.Invoke(session); peer.Complete(); await sender; await watcher; }
    }

    sealed class SocketPeer(WebSocket ws) : ITextPeer
    {
        // (frame, is it text); the oldest is dropped when a slow connection cannot keep up
        readonly Channel<(byte[] Data, bool Text)> queue = Channel.CreateBounded<(byte[], bool)>(new BoundedChannelOptions(64) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
        public bool Closing { get; private set; }
        public void Send(ReadOnlySpan<byte> frame) => queue.Writer.TryWrite((frame.ToArray(), false));
        public void SendText(string text) => queue.Writer.TryWrite((System.Text.Encoding.UTF8.GetBytes(text), true));
        public void Close(byte reason) { Closing = true; queue.Writer.TryComplete(); }
        public void Complete() => queue.Writer.TryComplete();
        public async Task Run()
        {
            try
            {
                await foreach (var f in queue.Reader.ReadAllAsync())
                    if (ws.State == WebSocketState.Open) await ws.SendAsync(f.Data, f.Text ? WebSocketMessageType.Text : WebSocketMessageType.Binary, true, CancellationToken.None);
                if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
            }
            catch (Exception e) when (e is WebSocketException or OperationCanceledException or ObjectDisposedException) { }
        }
        /// <summary>For a refused visitor: the queued Bye goes out, then the socket closes.</summary>
        public async Task Finish() { queue.Writer.TryComplete(); await Run(); }
    }
}
