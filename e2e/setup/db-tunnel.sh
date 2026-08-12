#!/usr/bin/env bash
# Tunnel SSH auto-réparant vers le Postgres du serveur de test.
#
# Le serveur coupe la session au bout de quelques dizaines de minutes
# ("Connection reset by peer"), ce qui suffit à faire tomber une campagne E2E
# en plein milieu — et les échecs ressemblent alors à des bugs applicatifs.
# Cette boucle reconnecte automatiquement.
#
#   bash e2e/setup/db-tunnel.sh          # garder ouvert pendant les tests
#   bash e2e/setup/db-tunnel.sh stop     # fermer, y compris un tunnel orphelin
#
# Port local 5434 et non 5433 : `docker-compose.yml` réserve 5433 au Postgres
# de la stack locale. Deux bases derrière le même port, c'est une opération
# d'écriture qui part sur la mauvaise — et le teardown des tests fait des
# DELETE. Ce n'est pas théorique : c'est arrivé, sans le moindre signal, les
# deux bases répondant avec le même schéma.
#
# Le port local et l'hôte distant sont surchargeables.
set -u

LOCAL_PORT="${LOCAL_PORT:-5434}"
REMOTE_HOST="${REMOTE_HOST:-root@159.195.218.131}"
# IP docker du conteneur Postgres — il n'expose aucun port sur l'hôte, ce qui
# est voulu : rien n'est ouvert sur Internet.
REMOTE_PG="${REMOTE_PG:-10.0.1.7:5432}"

# Le pidfile est la seule chose sur laquelle on peut compter ici. Sous Git Bash,
# un `kill` visant le script frappe le pid MSYS et non le processus Windows : le
# trap ne part pas, la boucle survit et relance un `ssh` toutes les 3 secondes.
# On s'en est aperçu en voyant un tunnel réapparaître seul après l'avoir tué.
# D'où le nettoyage à l'ouverture plutôt qu'à la fermeture : quoi qu'il soit
# arrivé au lancement précédent, celui-ci repart d'un port propre.
PIDFILE="${TMPDIR:-/tmp}/skilluv-db-tunnel-${LOCAL_PORT}.pid"

# Le pidfile porte deux pids : la boucle, puis son `ssh`. Tuer le `ssh` seul ne
# sert à rien — la boucle en relance un ; et tuer la boucle seule ne suffit pas
# non plus, car sous MSYS un `wait` sur un enfant Windows natif ne rend la main
# à aucun signal. D'où l'ordre ci-dessous : TERM à la boucle (il reste en
# attente), puis mort du `ssh`, ce qui débloque le `wait` et laisse enfin le
# trap s'exécuter.
kill_previous() {
	[ -f "${PIDFILE}" ] || return 0
	local loop_pid ssh_old
	{ read -r loop_pid; read -r ssh_old; } < "${PIDFILE}" 2>/dev/null || true
	[ -n "${loop_pid:-}" ] && kill "${loop_pid}" 2>/dev/null
	[ -n "${ssh_old:-}" ] && kill "${ssh_old}" 2>/dev/null
	sleep 1
	[ -n "${loop_pid:-}" ] && kill -9 "${loop_pid}" 2>/dev/null
	[ -n "${ssh_old:-}" ] && kill -9 "${ssh_old}" 2>/dev/null
	rm -f "${PIDFILE}"
	echo "tunnel précédent fermé (boucle ${loop_pid:-?}, ssh ${ssh_old:-?})"
	return 0
}

if [ "${1:-}" = "stop" ]; then
	kill_previous
	echo "port ${LOCAL_PORT} libéré"
	exit 0
fi

kill_previous

ssh_pid=""
cleanup() {
	[ -n "${ssh_pid}" ] && kill "${ssh_pid}" 2>/dev/null
	rm -f "${PIDFILE}"
	echo "[$(date +%H:%M:%S)] tunnel fermé"
	exit 0
}
trap cleanup INT TERM

echo "Tunnel ${LOCAL_PORT} → ${REMOTE_PG} via ${REMOTE_HOST} (Ctrl-C, ou \`db-tunnel.sh stop\`)"
attempt=0
while true; do
	attempt=$((attempt + 1))
	# En arrière-plan puis `wait` : au premier plan, `ssh` ne rendrait la main au
	# trap qu'à sa propre mort — donc jamais tant que le tunnel tient.
	ssh -N \
		-o BatchMode=yes \
		-o ExitOnForwardFailure=yes \
		-o ServerAliveInterval=20 \
		-o ServerAliveCountMax=3 \
		-L "${LOCAL_PORT}:${REMOTE_PG}" \
		"${REMOTE_HOST}" &
	ssh_pid=$!
	printf '%s\n%s\n' "$$" "${ssh_pid}" > "${PIDFILE}"
	wait "${ssh_pid}"
	code=$?
	ssh_pid=""
	echo "[$(date +%H:%M:%S)] tunnel fermé (code ${code}, tentative ${attempt}) — reconnexion dans 3 s"
	sleep 3
done
