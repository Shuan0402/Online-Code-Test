FROM alpine:3.19

ENV PROM_VERSION=2.45.0

RUN apk add --no-cache wget tar \
    && wget https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz \
    && tar -xvf prometheus-${PROM_VERSION}.linux-amd64.tar.gz \
    && mv prometheus-${PROM_VERSION}.linux-amd64/prometheus /bin/prometheus \
    && mv prometheus-${PROM_VERSION}.linux-amd64/promtool /bin/promtool \
    && mkdir -p /etc/prometheus /prometheus \
    && rm -rf prometheus-${PROM_VERSION}.linux-amd64* \
    && apk del wget tar

RUN addgroup -S prometheus && adduser -S -G prometheus prometheus \
    && chown -R prometheus:prometheus /etc/prometheus /prometheus

EXPOSE 9090

USER prometheus

ENTRYPOINT ["/bin/prometheus"]
CMD ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus"]