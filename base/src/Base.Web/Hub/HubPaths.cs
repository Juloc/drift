namespace Base.Web;

/// <summary>The three public doors of the central sign-in (listed in <see cref="Auth.ApiGuard.BasePublicPaths"/>).</summary>
public static class HubPaths
{
    public const string Begin = "/api/auth/hub/begin";
    public const string Callback = "/api/auth/hub/callback";
    public const string SignedOut = "/";       // where the hub sends the person back after its sign-out (the address after sign-out, registered at the hub)
    public const string BackChannelLogout = "/api/auth/hub/backchannel-logout";
}
