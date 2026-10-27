# Build from the repository root:
#   docker build -f _tools/minecraft-multiplayer/Dockerfile -t cave-room .
# Generate _site with Jekyll first to include the article. Persist /data.
FROM node:24-alpine
WORKDIR /app
COPY assets/js/minecraft-story.js assets/js/minecraft-play-core.js assets/js/minecraft-build-core.js ./assets/js/
COPY _tools/minecraft-multiplayer/package.json _tools/minecraft-multiplayer/package-lock.json ./_tools/minecraft-multiplayer/
RUN cd _tools/minecraft-multiplayer && npm ci --omit=dev
COPY _tools/minecraft-multiplayer/server.cjs _tools/minecraft-multiplayer/server-core.cjs ./_tools/minecraft-multiplayer/
COPY _site ./_site
ENV HOST=0.0.0.0 PORT=4174 DATA_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4174
CMD ["node", "_tools/minecraft-multiplayer/server.cjs"]
