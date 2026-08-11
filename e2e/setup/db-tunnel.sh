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
# Ctrl-C pour arrêter. Le port local et l'hôte distant sont surchargeables.
set -u

LOCAL_PORT="${LOCAL_PORT:-5433}"
REMOTE_HOST="${REMOTE_HOST:-root@159.195.218.131}"
# IP docker du conteneur Postgres — il n'expose aucun port sur l'hôte, ce qui
# est voulu : rien n'est ouvert sur Internet.
REMOTE_PG="${REMOTE_PG:-10.0.1.7:5432}"

echo "Tunnel ${LOCAL_PORT} → ${REMOTE_PG} via ${REMOTE_HOST} (Ctrl-C pour arrêter)"
attempt=0
while true; do
	attempt=$((attempt + 1))
	ssh -N \
		-o BatchMode=yes \
		-o ExitOnForwardFailure=yes \
		-o ServerAliveInterval=20 \
		-o ServerAliveCountMax=3 \
		-L "${LOCAL_PORT}:${REMOTE_PG}" \
		"${REMOTE_HOST}"
	code=$?
	echo "[$(date +%H:%M:%S)] tunnel fermé (code ${code}, tentative ${attempt}) — reconnexion dans 3 s"
	sleep 3
done
