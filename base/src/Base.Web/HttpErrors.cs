using System.Text.Json;
using Base.Core;

namespace Base.Web;

/// <summary>The one shape of every failed answer of the API: a stable code the browser translates, an English message, and the wrong fields (I18N-02).</summary>
public sealed record ErrorBody(string Error, string Message, IReadOnlyDictionary<string, string>? Fields = null, int? RetryAfter = null);

public static class HttpErrors
{
    public static async Task WriteAsync(HttpContext ctx, Error error)
    {
        ctx.Response.StatusCode = error.Status;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        if (error.RetryAfter > 0) ctx.Response.Headers.RetryAfter = error.RetryAfter.ToString();
        var body = new ErrorBody(error.Code, error.Message, error.Fields, error.RetryAfter > 0 ? error.RetryAfter : null);
        await ctx.Response.WriteAsync(JsonSerializer.Serialize(body, WebJson.Default.ErrorBody));
    }

    /// <summary>An <see cref="Error"/> as the answer of an endpoint.</summary>
    public static IResult ToHttp(this Error error) => new ErrorResult(error);

    /// <summary>The value as JSON when the result is fine, else the error.</summary>
    public static IResult ToHttp<T>(this Result<T> result, Func<T, IResult> ok) => result.Ok ? ok(result.Value) : new ErrorResult(result.Error!);

    public static IResult ToHttp(this Result result) => result.Ok ? Results.NoContent() : new ErrorResult(result.Error!);

    private sealed class ErrorResult(Error error) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext) => WriteAsync(httpContext, error);
    }
}

/// <summary>Catches what nobody expected: logs it and answers with the usual error shape, never with a stack trace.</summary>
internal sealed class ErrorBoundary(RequestDelegate next, ILogger<ErrorBoundary> log)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        try { await next(ctx); }
        catch (BadHttpRequestException e) when (!ctx.Response.HasStarted)
        {
            await HttpErrors.WriteAsync(ctx, new Error(e.StatusCode == 413 ? ErrorKind.TooLarge : ErrorKind.Invalid, e.StatusCode == 413 ? "too_large" : "input", "The request is not valid."));
        }
        catch (Exception e) when (e is not OperationCanceledException && !ctx.Response.HasStarted)
        {
            log.LogError(e, "Unexpected error in {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
            await HttpErrors.WriteAsync(ctx, new Error(ErrorKind.Failed, "failed", "Something went wrong on the server."));
        }
    }
}
