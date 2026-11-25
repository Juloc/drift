using System.Text.RegularExpressions;
using Base.Core;

namespace Base.Accounts;

/// <summary>One role an app knows: a key (what is stored and what the central sign-in sends) and a name for people.</summary>
public sealed record AppRole(string Key, Localized Name);

/// <summary>
/// The small, fixed list of roles of one app, named by the app at one place (<c>BaseAppOptions.Roles</c>). A person holds exactly one of them (SEC-03).
/// The list always has <see cref="Roles.Admin"/>: the first person of the setup is an admin and somebody must always be able to administer the app.
/// </summary>
public sealed partial class AppRoles
{
    public const int Max = 8;

    [GeneratedRegex("^[a-z][a-z0-9_-]{0,23}$")]
    private static partial Regex KeyPattern();

    /// <summary>What an app gets without saying anything: an administrator and a member.</summary>
    public static IReadOnlyList<AppRole> Default { get; } =
    [
        new(Roles.Admin, new Localized("Administrator", "Administration")),
        new("member", new Localized("Member", "Mitglied")),
    ];

    public IReadOnlyList<AppRole> All { get; }

    public AppRoles(IReadOnlyList<AppRole> roles)
    {
        if (roles.Count is 0 or > Max) throw new InvalidOperationException($"An app has 1 to {Max} roles.");
        foreach (var r in roles)
            if (!KeyPattern().IsMatch(r.Key) || string.IsNullOrWhiteSpace(r.Name.En)) throw new InvalidOperationException($"The role '{r.Key}' is not valid: a key of a-z, 0-9, dash, underscore (at most 24) and an English name.");
        if (roles.Select(r => r.Key).Distinct().Count() != roles.Count) throw new InvalidOperationException("A role key is used twice.");
        if (!roles.Any(r => r.Key == Roles.Admin)) throw new InvalidOperationException("The roles of an app include 'admin' (the first person of the setup holds it).");
        All = roles;
    }

    public bool Knows(string? key) => key is not null && All.Any(r => r.Key == key);
}
