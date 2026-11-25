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
            if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
            // a page of another site must not be able to drive through this socket
            var origin = ctx.Request.Headers.Origin.ToString();
            if (origin.Length > 0 && !(Uri.TryCreate(origin, UriKind.Absolute, out var u) && string.Equals(u.Authority, ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase)))
            { ctx.Response.StatusCode = 403; return; }
            int.TryParse(ctx.Request.Query["car"], out var car);
            using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
            var peer = new SocketPeer(ws);
            var session = relay.Join(peer, addressOf(ctx), car);
            if (session is null) { await peer.Finish(); return; }
            var sender = peer.Run();
            var buf = new byte[relay.MaxFrameBuffer];
            try
            {
                while (ws.State == WebSocketState.Open && !peer.Closing)
                {
                    var r = await ws.ReceiveAsync(buf, ctx.RequestAborted);
                    if (r.MessageType == WebSocketMessageType.Close) break;
                    if (r.MessageType != WebSocketMessageType.Binary) continue;
                    if (!r.EndOfMessage) { relay.OnOversize(session); break; }
                    relay.OnMessage(session, buf.AsSpan(0, r.Count));
                }
            }
            catch (Exception e) when (e is WebSocketException or OperationCanceledException) { }
            finally { relay.Leave(session); peer.Complete(); await sender; }
        });
        _ = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1.0 / 15));
            try { while (await timer.WaitForNextTickAsync(app.Lifetime.ApplicationStopping)) relay.Tick(); } catch (OperationCanceledException) { }
        });
    }

    sealed class SocketPeer(WebSocket ws) : IPeer
    {
        readonly Channel<byte[]> queue = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(32) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
        public bool Closing { get; private set; }
        public void Send(ReadOnlySpan<byte> frame) => queue.Writer.TryWrite(frame.ToArray());
        public void Close(byte reason) { Closing = true; queue.Writer.TryComplete(); }
        public void Complete() => queue.Writer.TryComplete();
        public async Task Run()
        {
            try
            {
                await foreach (var f in queue.Reader.ReadAllAsync())
                    if (ws.State == WebSocketState.Open) await ws.SendAsync(f, WebSocketMessageType.Binary, true, CancellationToken.None);
                if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
            }
            catch (Exception e) when (e is WebSocketException or OperationCanceledException or ObjectDisposedException) { }
        }
        /// <summary>For a refused visitor: the queued Bye goes out, then the socket closes.</summary>
        public async Task Finish() { queue.Writer.TryComplete(); await Run(); }
    }
}
