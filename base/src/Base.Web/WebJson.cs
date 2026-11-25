using System.Text.Json;
using System.Text.Json.Serialization;
using Base.Web.Auth;
using Base.Web.Settings;

namespace Base.Web;

/// <summary>JSON of the base's own endpoints without reflection: every type they send or receive stands here. An app's own types are found by reflection.</summary>
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(ErrorBody))]
[JsonSerializable(typeof(Health))]
[JsonSerializable(typeof(About))]
[JsonSerializable(typeof(LogoutResponse))]
[JsonSerializable(typeof(PeopleResponse))]
[JsonSerializable(typeof(CreatePersonRequest))]
[JsonSerializable(typeof(CreatePersonResponse))]
[JsonSerializable(typeof(InviteDto))]
[JsonSerializable(typeof(RoleRequest))]
[JsonSerializable(typeof(InviteTokenRequest))]
[JsonSerializable(typeof(InviteBeginRequest))]
[JsonSerializable(typeof(InviteFinishRequest))]
[JsonSerializable(typeof(InviteInfoResponse))]
[JsonSerializable(typeof(HubSettingsDto))]
[JsonSerializable(typeof(HubSettingsRequest))]
[JsonSerializable(typeof(HubCheckDto))]
[JsonSerializable(typeof(HubBeginDto))]
[JsonSerializable(typeof(SetupStatus))]
[JsonSerializable(typeof(SetupBeginRequest))]
[JsonSerializable(typeof(SetupBeginResponse))]
[JsonSerializable(typeof(SetupFinishRequest))]
[JsonSerializable(typeof(LoginRequest))]
[JsonSerializable(typeof(LoginResponse))]
[JsonSerializable(typeof(MeResponse))]
[JsonSerializable(typeof(PasswordChangeRequest))]
[JsonSerializable(typeof(TotpBeginRequest))]
[JsonSerializable(typeof(TotpBeginResponse))]
[JsonSerializable(typeof(TotpFinishRequest))]
[JsonSerializable(typeof(TotpFinishResponse))]
[JsonSerializable(typeof(SessionsResponse))]
[JsonSerializable(typeof(EndedResponse))]
[JsonSerializable(typeof(AuditResponse))]
[JsonSerializable(typeof(SettingsResponse))]
[JsonSerializable(typeof(SettingRequest))]
[JsonSerializable(typeof(Dictionary<string, JsonElement>))]
internal sealed partial class WebJson : JsonSerializerContext;
