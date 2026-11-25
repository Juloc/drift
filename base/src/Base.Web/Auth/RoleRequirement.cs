namespace Base.Web.Auth;

/// <summary>The role an endpoint needs. Declared with <see cref="Endpoints.RequireRole{T}"/>, checked in one place: <see cref="ApiGuard"/> (SEC-03).</summary>
public sealed record RoleRequirement(string Role);

public static class Endpoints
{
    /// <summary>
    /// Says that only people with this role may call the endpoint (or every endpoint of a group). The guard answers 403 before the handler runs,
    /// so a handler cannot forget the check, and a test can list which endpoints demand which role.
    /// </summary>
    public static T RequireRole<T>(this T builder, string role) where T : IEndpointConventionBuilder => builder.WithMetadata(new RoleRequirement(role));

    /// <summary>
    /// Says how large a body the endpoint (or every endpoint of a group) takes, in bytes, for an upload under a path that carries an id.
    /// It applies only behind a session and changes nothing about who may call; the guard limits the declared length and the body while it is read.
    /// Not more than 1 GiB and more than 0, else the start is refused.
    /// </summary>
    public static T WithMaxBody<T>(this T builder, long bytes) where T : IEndpointConventionBuilder
    {
        if (bytes is <= 0 or > BodyLimit.Ceiling) throw new ArgumentOutOfRangeException(nameof(bytes), bytes, "A body limit is more than 0 and at most 1 GiB.");
        return builder.WithMetadata(new BodyLimit(bytes));
    }
}

/// <summary>The largest request body an endpoint takes, instead of the default of the guard (SEC-04). Declared with <see cref="Endpoints.WithMaxBody{T}"/>.</summary>
public sealed record BodyLimit(long Bytes)
{
    /// <summary>The upper bound of a declared limit: 1 GiB.</summary>
    public const long Ceiling = 1L << 30;
}
