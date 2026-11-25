namespace Base.Core;

/// <summary>A text for people in two languages: English is required, German is expected (the contract of the family: <c>en</c> always there, <c>de</c> where known).</summary>
public sealed record Localized(string En, string? De = null)
{
    /// <summary>The text in a language ("de" or "en"); English when the language has none.</summary>
    public string For(string lang) => lang == "de" && !string.IsNullOrWhiteSpace(De) ? De : En;
}
