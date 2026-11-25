namespace Base.Core;

/// <summary>
/// A clock that only moves when told to. Code never asks the system clock itself; it takes a <see cref="TimeProvider"/> (CODE-05), and a test hands it this one.
/// </summary>
public sealed class ManualTime(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
