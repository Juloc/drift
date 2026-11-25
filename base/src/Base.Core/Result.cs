namespace Base.Core;

/// <summary>What went wrong, as a class of failure. The number is the HTTP status the web layer answers with.</summary>
public enum ErrorKind
{
    Invalid = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    Conflict = 409,
    TooLarge = 413,
    TooMany = 429,
    Failed = 500,
}

/// <summary>
/// An expected failure. <see cref="Code"/> is stable and is what the browser translates (I18N-02); <see cref="Message"/> is plain English for logs and for
/// clients without a translation. <see cref="Fields"/> names the inputs that are wrong (field name to a short code such as "required").
/// </summary>
public sealed record Error(ErrorKind Kind, string Code, string Message, IReadOnlyDictionary<string, string>? Fields = null, int RetryAfter = 0)
{
    public int Status => (int)Kind;

    public static Error Invalid(string code, string message) => new(ErrorKind.Invalid, code, message);
    public static Error Unauthorized(string code = "auth.none", string message = "Not signed in.") => new(ErrorKind.Unauthorized, code, message);
    public static Error Forbidden(string code = "forbidden", string message = "Not allowed.") => new(ErrorKind.Forbidden, code, message);
    public static Error NotFound(string code = "not_found", string message = "Not found.") => new(ErrorKind.NotFound, code, message);
    public static Error Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
    public static Error TooMany(int retryAfterSeconds) => new(ErrorKind.TooMany, "too_many", "Too many attempts. Try again later.", RetryAfter: retryAfterSeconds);
}

/// <summary>The outcome of an operation without a value: fine, or an <see cref="Core.Error"/>. Expected failures are returned, not thrown (CODE-04).</summary>
public readonly struct Result
{
    public Error? Error { get; }
    public bool Ok => Error is null;

    private Result(Error? error) => Error = error;

    public static Result Success => default;
    public static implicit operator Result(Error error) => new(error);
}

/// <summary>The outcome of an operation with a value: the value, or an <see cref="Core.Error"/>.</summary>
public readonly struct Result<T>
{
    private readonly T? _value;
    public Error? Error { get; }
    public bool Ok => Error is null;

    /// <summary>The value. Only read it after checking <see cref="Ok"/>.</summary>
    public T Value => Error is null ? _value! : throw new InvalidOperationException($"No value: {Error.Code}");

    private Result(T? value, Error? error) { _value = value; Error = error; }

    public static implicit operator Result<T>(T value) => new(value, null);
    public static implicit operator Result<T>(Error error) => new(default, error);

    public TOut Match<TOut>(Func<T, TOut> ok, Func<Error, TOut> failed) => Error is null ? ok(_value!) : failed(Error);
}
