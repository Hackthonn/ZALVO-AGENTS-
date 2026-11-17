# shellcheck shell=sh
# Installed as /etc/profile.d/zalvo.sh. Debian's /etc/profile resets PATH for
# every login shell (`bash -l`, `docker exec <c> bash -l`, ssh, the terminal
# tool's background `bash -lic`), dropping the image's ENV PATH dirs, so bare
# `zalvo` exits 127 there. Put them back in the ENV PATH order; dirs a login
# PATH already lists keep their position.
for __zalvo_p in /opt/data/.local/bin /opt/zalvo/.venv/bin /opt/zalvo/bin; do
    case ":$PATH:" in
        *":$__zalvo_p:"*) ;;
        *) PATH="$__zalvo_p:$PATH" ;;
    esac
done
unset __zalvo_p
export PATH
