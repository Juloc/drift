using System.Buffers.Text;
using System.Text;

namespace Base.Core;

/// <summary>What a list request asks for: how many rows, and after which row (the cursor of the previous page). Limits are clamped, never trusted (LIST-01).</summary>
public sealed record PageRequest(int Limit, string? Cursor)
{
    public const int DefaultLimit = 50, MaxLimit = 200;

    public static PageRequest From(int? limit, string? cursor) =>
        new(Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit), string.IsNullOrEmpty(cursor) || cursor.Length > 400 ? null : cursor);
}

/// <summary>One page of a list. <see cref="Next"/> is the cursor of the following page, null on the last one.</summary>
public sealed record Page<T>(IReadOnlyList<T> Items, string? Next)
{
    /// <summary>Builds a page from rows that were read with <c>limit + 1</c>: the extra row only says that there is more.</summary>
    public static Page<T> From(IReadOnlyList<T> rows, int limit, Func<T, string> cursorOf)
    {
        if (rows.Count <= limit) return new(rows, null);
        var items = rows.Take(limit).ToArray();
        return new(items, cursorOf(items[^1]));
    }
}

/// <summary>
/// A cursor is the sort key of the last row of a page, opaque to the browser. Keyset paging ("rows after this key") stays fast and correct while
/// rows are added; an offset does neither.
/// </summary>
public static class Cursor
{
    private const char Separator = '\u001f';

    public static string Encode(params string[] parts) => Base64Url.EncodeToString(Encoding.UTF8.GetBytes(string.Join(Separator, parts)));

    /// <summary>The parts of a cursor, or false when it is not one of ours with exactly <paramref name="count"/> parts.</summary>
    public static bool TryDecode(string? cursor, int count, out string[] parts)
    {
        parts = [];
        if (string.IsNullOrEmpty(cursor)) return false;
        try { parts = Encoding.UTF8.GetString(Base64Url.DecodeFromChars(cursor)).Split(Separator); }
        catch (FormatException) { return false; }
        return parts.Length == count;
    }

    public static string Encode(Guid id) => Encode(id.ToString("N"));

    public static bool TryDecode(string? cursor, out Guid id)
    {
        id = Guid.Empty;
        return TryDecode(cursor, 1, out var parts) && Guid.TryParseExact(parts[0], "N", out id);
    }
}
