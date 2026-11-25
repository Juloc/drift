using Microsoft.Extensions.FileProviders;

namespace Drift.GameAccounts;

/// <summary>
/// Sign-up is open only while the privacy and imprint pages (wwwroot/legal/) are the owner's: as long as one of them still contains the marker <c>[[OWNER-TEXT]]</c>
/// (the placeholder we ship), registration answers "not open yet" and the start logs a warning. The texts are the owner's to write, not ours.
/// </summary>
public sealed class LegalPages(IFileProvider webRoot, ILogger<LegalPages> log)
{
    public const string Marker = "[[OWNER-TEXT]]";
    public static readonly string[] Files = ["legal/privacy.html", "legal/imprint.html"];
    /// <summary>Tests switch the check off (the shipped placeholders would keep sign-up closed).</summary>
    public static bool Required { get; set; } = true;

    /// <summary>True when sign-up may be open: both pages exist and none carries the placeholder marker.</summary>
    public bool Complete => !Required || Files.All(f => webRoot.GetFileInfo(f) is { Exists: true } fi && !Read(fi).Contains(Marker, StringComparison.Ordinal));

    static string Read(IFileInfo f) { using var r = new StreamReader(f.CreateReadStream()); return r.ReadToEnd(); }

    public void WarnIfOpen() { if (!Complete) log.LogWarning("Sign-up for games accounts is CLOSED: legal/privacy.html and legal/imprint.html still carry {Marker}. The owner's texts go there.", Marker); }
}
