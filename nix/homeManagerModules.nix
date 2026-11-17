# nix/homeManagerModules.nix — the Home Manager module for zalvo-agent
#
# This module is the user-level equivalent of nixosModules.default. ZALVO is
# an agent for one person. The credentials, the memory, the sessions and the
# cron jobs all belong to that person. Thus a user-level module is correct on
# each distribution, and not only on NixOS.
#
# `services.zalvo-agent` is the same option set on both modules. All of the
# options except the system-level ones come from nix/moduleCommon.nix, so an
# example from the NixOS documentation works here without a change. Only the
# necessary parts are different:
#
#   removed   user, group, createUser  — Home Manager runs as the user
#   removed   container.*              — it needs root and the Docker socket
#   removed   UMask 0007               — that mode shares state with a UNIX
#                                        group, but this state has one user
#   changed   systemd.services         -> systemd.user.services or
#                                        launchd.agents
#   changed   system.activationScripts -> home.activation
#   changed   addToSystemPackages      -> programs.zalvo-agent.enable and
#                                        home.sessionVariables
#   added     programs.zalvo-agent    the CLI and the desktop application,
#                                      because Home Manager separates an
#                                      installation from a daemon
#   changed   stateDir (+ "/.zalvo")  -> zalvoHome, set directly
#
# To use the module:
#   imports = [ zalvo-agent.homeManagerModules.default ];
#   programs.zalvo-agent = {
#     enable = true;          # the zalvo CLI on your PATH
#     desktop.enable = true;  # the Electron application and a launcher
#   };
#   services.zalvo-agent = {
#     enable = true;
#     gateway.enable = true;
#     settings.model.default = "anthropic/claude-sonnet-4";
#     environmentFiles = [ config.sops.secrets."zalvo/env".path ];
#   };
#
# CAUTION: Enable linger for the account. Without linger, systemd stops the
# user manager at logout, and both units stop with it. Home Manager cannot
# run `loginctl enable-linger`. On NixOS, set
#   users.users.<name>.linger = true;
# On other systems, run `loginctl enable-linger <name>` one time.
{ inputs, ... }:
{
  flake.homeManagerModules.default =
    {
      config,
      lib,
      options,
      pkgs,
      ...
    }:

    let
      cfg = config.services.zalvo-agent;
      cfgPrograms = config.programs.zalvo-agent;
      common = import ./moduleCommon.nix { inherit lib; };

      effectivePackage = common.effectivePackage cfg;
      zalvo-agent = inputs.self.packages.${pkgs.stdenv.hostPlatform.system}.default;

      inherit (pkgs.stdenv.hostPlatform) isDarwin isLinux;

      processEnvironment = common.processEnvironment {
        inherit (cfg) zalvoHome;
        # The CLI reads this value and names it when it refuses a
        # configuration change.
        managedSystem = "home-manager";
      };
      unitPath = lib.makeBinPath (common.processPath { inherit pkgs cfg; });

      # ── The desktop launcher ───────────────────────────────────────────
      # A GUI launcher reads no shell profile, so home.sessionVariables does
      # not reach it, and the application would open ~/.zalvo while the
      # services use zalvoHome. Thus the launcher carries the value itself.
      #
      # ZALVO_MANAGED rides along only when the services are enabled. That
      # variable makes the CLI refuse a configuration change and name the
      # rebuild command. A person who enables `programs.` alone has no
      # activation and no managed configuration, so the application must not
      # claim one and refuse an edit that nothing else owns.
      desktopEnvironment = {
        ZALVO_HOME = cfg.zalvoHome;
      }
      // lib.optionalAttrs cfg.enable {
        inherit (processEnvironment) ZALVO_MANAGED;
      }
      // lib.optionalAttrs desktopUsesService {
        ZALVO_DESKTOP_REMOTE_URL = "http://${cfg.backend.host}:${toString cfg.backend.port}";
      };

      # The application reaches the backend of the service only when there is
      # a backend to reach AND a shared token to present with. Without the
      # token the desktop resolver throws ("ZALVO_DESKTOP_REMOTE_URL is set
      # but ZALVO_DESKTOP_REMOTE_TOKEN is not"), so the two variables travel
      # together or not at all.
      desktopUsesService = cfg.enable && cfg.backend.mode != "none" && cfg.backend.sessionTokenFile != null;

      # The token is read at start time and never with `--set`. makeWrapper
      # writes a --set value into the Nix store, which all users can read.
      desktopRun = lib.optional desktopUsesService ''
        _token_file=${lib.escapeShellArg cfg.backend.sessionTokenFile}

        # Secret managers leave a "$XDG_RUNTIME_DIR" placeholder in secret
        # paths for a shell to expand (agenix's Home Manager module does).
        # escapeShellArg froze it into a literal, so expand it here.
        _token_file=''${_token_file//\$\{XDG_RUNTIME_DIR\}/''${XDG_RUNTIME_DIR:-}}

        if [ -r "$_token_file" ]; then
          ZALVO_DESKTOP_REMOTE_TOKEN="$(tr -d '\r\n' < "$_token_file")"
          export ZALVO_DESKTOP_REMOTE_TOKEN
        else
          echo "zalvo-desktop: cannot read the session token at $_token_file." >&2
          echo "zalvo-desktop: the application starts its own backend instead of the one of the service." >&2
        fi
      '';

      # `override`, and not `overrideAttrs`: the values go into the wrapper
      # that the installPhase writes, and not into a derivation attribute.
      desktopPackage = cfgPrograms.desktop.package.override {
        extraEnv = desktopEnvironment;
        extraRun = desktopRun;
      };

      # The systemd unit that the gateway and the backend both start from.
      mkUnit =
        {
          description,
          argv,
          environment ? { },
        }:
        {
          Unit = {
            Description = description;
            # Do not use network-online.target here. That is a system target.
            # A user unit that orders against it has no effect, and systemd
            # gives no message.
            After = [ "default.target" ];
          };
          Install.WantedBy = [ "default.target" ];
          Service = {
            Type = "simple";
            Environment =
              (lib.mapAttrsToList (k: v: "${k}=${v}") processEnvironment)
              ++ (lib.mapAttrsToList (k: v: "${k}=${lib.escapeShellArg v}") environment)
              ++ [
                "PATH=${unitPath}"
              ];
            ExecStart = lib.escapeShellArgs argv;
            WorkingDirectory = cfg.workingDirectory;
            Restart = cfg.restart;
            RestartSec = cfg.restartSec;
            # This state has one user. Keep it private. The NixOS module uses
            # 0007 to share the state with a UNIX group.
            UMask = "0077";
            NoNewPrivileges = true;
            PrivateTmp = true;
          };
        };

      mkAgent =
        {
          argv,
          logName,
          environment ? { },
        }:
        {
          enable = true;
          config = {
            Label = "org.nix-community.home.${logName}";
            ProgramArguments = argv;
            EnvironmentVariables =
              processEnvironment
              // environment
              // {
                PATH = "${unitPath}:/usr/bin:/bin:/usr/sbin:/sbin";
              };
            WorkingDirectory = cfg.workingDirectory;
            RunAtLoad = true;
            KeepAlive =
              if cfg.restart == "always" then
                true
              else
                {
                  SuccessfulExit = false;
                  Crashed = true;
                };
            ThrottleInterval = cfg.restartSec;
            StandardOutPath = "${config.home.homeDirectory}/Library/Logs/${logName}.log";
            StandardErrorPath = "${config.home.homeDirectory}/Library/Logs/${logName}.err.log";
            ProcessType = "Background";
          };
        };

    in
    {
      # ── programs.zalvo-agent — the installation ───────────────────────
      # Home Manager separates "install this application for me" from "run
      # this daemon". ZALVO needs both, and a person can want one without
      # the other: an application with no gateway, or a headless gateway on
      # a machine with no display.
      #
      # `services.zalvo-agent` stays the authority for the state and the
      # configuration. This module reads zalvoHome and the backend address
      # from it, and never the reverse.
      options.programs.zalvo-agent = {
        enable = lib.mkEnableOption ''
          the ZALVO Agent command line application.

          This adds `zalvo` to home.packages, and exports ZALVO_HOME with
          home.sessionVariables. An interactive shell then uses the same
          state as `services.zalvo-agent`
        '';

        package = lib.mkOption {
          type = lib.types.package;
          default = effectivePackage;
          defaultText = lib.literalExpression "config.services.zalvo-agent.package";
          description = ''
            The zalvo-agent package to install.

            The default follows `services.zalvo-agent.package`, and applies
            `extraPythonPackages` and `extraDependencyGroups` from that
            module. Thus the command line and the services are one build,
            and a plugin that the services can load is a plugin that your
            shell can load.
          '';
        };

        desktop = {
          enable = lib.mkEnableOption ''
            the ZALVO Desktop application (Electron).

            This adds `zalvo-desktop` to home.packages, with an XDG
            launcher entry on Linux. The launcher starts the same ZALVO
            runtime that `package` gives, and reads the ZALVO_HOME of
            `services.zalvo-agent`. Thus the application, the interactive
            shell and the services share one state directory.

            The Electron application carries its own ZALVO runtime with
            the usual distribution. This module gives it the Nix package
            instead, with ZALVO_DESKTOP_ZALVO. It installs no second copy
            of ZALVO, and it downloads nothing on the first start
          '';

          package = lib.mkOption {
            type = lib.types.package;
            default = cfgPrograms.package.zalvoDesktop;
            defaultText = lib.literalExpression "config.programs.zalvo-agent.package.zalvoDesktop";
            description = ''
              The zalvo-desktop package to use.

              The default follows `package`, and thus also
              `services.zalvo-agent.extraPythonPackages` and
              `extraDependencyGroups`, because the desktop application is a
              passthru of the agent package. A package that you set here
              carries its own ZALVO runtime, and this module cannot make
              it agree with the services.
            '';
          };
        };
      };

      options.services.zalvo-agent =
        common.sharedOptions {
          defaultPackage = zalvo-agent;
          defaultPackageText = lib.literalExpression "zalvo-agent.packages.\${system}.default";
          defaultWorkingDirectory = config.home.homeDirectory;
          defaultWorkingDirectoryText = lib.literalExpression "config.home.homeDirectory";
        }
        // {
          zalvoHome = lib.mkOption {
            type = lib.types.str;
            default = "${config.home.homeDirectory}/.zalvo";
            defaultText = lib.literalExpression ''"''${config.home.homeDirectory}/.zalvo"'';
            description = ''
              The value of ZALVO_HOME. This state directory holds
              config.yaml, .env, auth.json, the sessions, the skills, the
              memory and the cron jobs.

              The NixOS module takes a `stateDir` and adds `/.zalvo` to it.
              This module sets ZALVO_HOME directly. Thus an existing
              ~/.zalvo continues to work, and you can give the directory any
              name.
            '';
            example = "/home/alice/.zalvo-work";
          };

          # `installPackage` moved to `programs.zalvo-agent.enable`. The
          # option is dead, but it must not be silent: it defaulted to true,
          # so a person who never named it still got the command line, and a
          # quiet removal gives them a machine with no `zalvo` and no
          # message. mkOption with an assertion, and not
          # mkRemovedOptionModule, because the message must name the exact
          # replacement for the value they set.
          installPackage = lib.mkOption {
            type = lib.types.nullOr lib.types.bool;
            default = null;
            visible = false;
            description = ''
              Removed. Use `programs.zalvo-agent.enable` instead.
            '';
          };

          gateway.enable = lib.mkEnableOption "the messaging gateway service (Telegram, Discord, Slack, ...)";
        };

      config = lib.mkMerge [

        # ── programs.zalvo-agent — the installation ──────────────────────
        # Outside the `services.enable` guard on purpose. A person can want
        # the command line or the application on a machine that runs no
        # daemon at all.
        (lib.mkIf cfgPrograms.enable {
          home.packages = [ cfgPrograms.package ];
          home.sessionVariables.ZALVO_HOME = cfg.zalvoHome;
        })

        # A launcher from the desktop menu reads no shell profile, so the
        # ZALVO_HOME that `programs.enable` exports does not reach it. Home
        # Manager writes only systemd.user.sessionVariables into
        # environment.d, and this module does not put ZALVO_HOME there,
        # because that file applies to each user unit. Thus the launcher
        # carries the value itself. See desktopEnvironment above.
        (lib.mkIf cfgPrograms.desktop.enable {
          home.packages = [ desktopPackage ];
        })

        {
          assertions = [
            {
              # `installPackage` was removed in favour of the programs/services
              # split. It defaulted to true, so a quiet removal leaves a person
              # with no `zalvo` on the PATH and no message.
              assertion = cfg.installPackage == null;
              message = common.installPackageRemovedMessage cfg.installPackage;
            }
          ];
        }

        (lib.mkIf cfg.enable (
          lib.mkMerge [

            # ── Merge MCP servers into settings ────────────────────────────
            (lib.mkIf (cfg.mcpServers != { }) {
              services.zalvo-agent.settings.mcp_servers = common.mcpServersToConfig cfg.mcpServers;
            })

            {
              assertions =
                common.pluginNameAssertions {
                  inherit cfg;
                  optionPath = "services.zalvo-agent";
                }
                ++ common.workspaceFilesAssertions {
                  inherit cfg;
                  opt = options.services.zalvo-agent.workingDirectory;
                  optionPath = "services.zalvo-agent";
                }
                ++ common.backendBindAssertions {
                  inherit cfg;
                  optionPath = "services.zalvo-agent";
                }
                ++ [
                  {
                    # The interface poll reads `ip`, which iproute2 supplies on
                    # Linux only.
                    assertion = !isDarwin || cfg.backend.waitFor != "interface";
                    message = "services.zalvo-agent.backend.waitFor = \"interface\" works on Linux only. Use \"hostname\" on Darwin.";
                  }
                ];
            }

            # The agent runs these tools, so they belong on the PATH of the
            # person as well as in the unit.
            (lib.mkIf cfgPrograms.enable {
              home.packages = cfg.extraPackages;
            })

            # ── Activation: directories, config, secrets, documents ────────
            {
              # The activation runs after writeBoundary, when the home.file
              # symlinks are in place. It also runs after linkGeneration, when
              # Home Manager completes the switch. A secret that the activation
              # entry of sops-nix writes exists at that point.
              home.activation.zalvoAgentSetup =
                lib.hm.dag.entryAfter
                  [
                    "writeBoundary"
                    "linkGeneration"
                  ]
                  (
                    common.mkStateScript {
                      inherit pkgs cfg;
                      inherit (cfg) zalvoHome workingDirectory;
                      run = "$DRY_RUN_CMD ";
                      stateDirs = common.stateSubdirs;
                      managedSystem = "home-manager";
                      # This state has one user. No group needs access to it.
                      modes = {
                        config = "0600";
                        env = "0600";
                        managed = "0600";
                        auth = "0600";
                        document = "0600";
                      };
                    }
                  );
            }

            # ── Linux: systemd user services ───────────────────────────────
            (lib.mkIf (isLinux && cfg.gateway.enable) {
              systemd.user.services.zalvo-agent = mkUnit {
                description = "ZALVO Agent Gateway";
                argv = common.gatewayArgv cfg;
              };
            })

            (lib.mkIf (isLinux && cfg.backend.mode != "none") {
              systemd.user.services.zalvo-backend = mkUnit {
                description = common.backendDescription cfg;
                argv = common.backendArgv { inherit pkgs cfg; };
                environment = common.backendSessionEnvironment { inherit cfg; };
              };
            })

            # ── Darwin: launchd agents ─────────────────────────────────────
            (lib.mkIf (isDarwin && cfg.gateway.enable) {
              launchd.agents.zalvo-agent = mkAgent {
                argv = common.gatewayArgv cfg;
                logName = "zalvo-agent";
              };
            })

            (lib.mkIf (isDarwin && cfg.backend.mode != "none") {
              launchd.agents.zalvo-backend = mkAgent {
                argv = common.backendArgv { inherit pkgs cfg; };
                logName = "zalvo-backend";
                environment = common.backendSessionEnvironment { inherit cfg; };
              };
            })
          ]
        ))
      ];
    };
}
