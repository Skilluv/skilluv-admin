#!/usr/bin/env bash
# Tunnel SSH auto-réparant vers le Postgres du serveur de test.
#
# Le serveur coupe la session au bout de quelques dizaines de minutes
# ("Connection reset by peer"), ce qui suffit à faire tomber une campagne E2E
# en plein milieu — et les échecs ressemblent alors à des bugs applicatifs.
# Cette boucle reconnecte automatiquement.
#
#   bash e2e/setup/db-tunnel.sh          # garder ouvert pendant les tests
#
# Port local 5434 et non 5433 : `docker-compose.yml` réserve 5433 au Postgres
# de la stack locale. Deux bases derrière le même port, c'est une opération
# d'écriture qui part sur la mauvaise — et le teardown des tests fait des
# DELETE.
#
# Ctrl-C pour arrêter. Le port local et l'hôte distant sont surchargeables.
set -u

LOCAL_PORT="${LOCAL_PORT:-5434}"
REMOTE_HOST="${REMOTE_HOST:-root@159.195.218.131}"
# IP docker du conteneur Postgres — il n'expose aucun port sur l'hôte, ce qui
# est voulu : rien n'est ouvert sur Internet.
REMOTE_PG="${REMOTE_PG:-10.0.1.7:5432}"

# Sans ce trap, tuer le script laisse vivre son `ssh`, qui garde le port. Vécu :
# des tunnels orphelins ont repris 5433 et détourné vers le serveur distant des
# connexions destinées au Postgres docker local — deux bases derrière une même
# adresse, sans le moindre signal.
ssh_pid=""
cleanup() {
	[ -n "${ssh_pid}" ] && kill "${ssh_pid}" 2>/dev/null
	echo "[$(date +%H:%M:%S)] tunnel fermé proprement"
	exit 0
}
trap cleanup INT TERM

echo "Tunnel ${LOCAL_PORT} → ${REMOTE_PG} via ${REMOTE_HOST} (Ctrl-C pour arrêter)"
attempt=0
while true; do
	attempt=$((attempt + 1))
	# En arrière-plan puis `wait` : un `ssh` au premier plan ne rendrait la main
	# au trap qu'à sa propre mort, donc jamais tant que le tunnel tient.
	ssh -N \
		-o BatchMode=yes \
		-o ExitOnForwardFailure=yes \
		-o ServerAliveInterval=20 \
		-o ServerAliveCountMax=3 \
		-L "${LOCAL_PORT}:${REMOTE_PG}" \
		"${REMOTE_HOST}" &
	ssh_pid=$!
	wait "${ssh_pid}"
	code=$?
	ssh_pid=""
	echo "[$(date +%H:%M:%S)] tunnel fermé (code ${code}, tentative ${attempt}) — reconnexion dans 3 s"
	sleep 3
done
