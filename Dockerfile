# The image of the app: one container (OPS-01). Built from the root of the repository (the Compose file does that):
#   docker build .
# APP_DIR is the folder of the app, BASE_DIR the folder that holds the base (src/, ui/, VERSION).
ARG APP_DIR=src/Drift
ARG BASE_DIR=base

# The SDK always runs on the platform of the builder, also when the image is built for arm64: the output is plain .NET.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG APP_DIR
ARG BASE_DIR
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY ${BASE_DIR}/VERSION ${BASE_DIR}/VERSION
COPY ${BASE_DIR}/src ${BASE_DIR}/src
COPY ${BASE_DIR}/ui ${BASE_DIR}/ui
COPY ${APP_DIR} ${APP_DIR}
# the relay (one small class, shared with the website's server) and the game page's files travel with the app
COPY server/Relay server/Relay
COPY game game
COPY vendor/three vendor/three
# The commit comes from the caller (CI); it only shows in "About". The version stands in Directory.Build.props.
ARG COMMIT=
RUN dotnet publish ${APP_DIR}/Drift.csproj -c Release -o /app -p:SourceRevisionId=${COMMIT}

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# BASE_DATA: the folder for the server's own key file; a volume in the Compose file, so it survives an update (AUTH-04)
ENV ASPNETCORE_HTTP_PORTS=8080 BASE_DATA=/data
RUN mkdir /data && chown $APP_UID /data
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Drift.dll"]
