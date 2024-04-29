import { initializeOpenTelemetry } from "./instrumentation";
initializeOpenTelemetry({
    serviceName: process.env.SERVICE_NAME ?? "test-service",
    version: process.env.SERVICE_VERSION ?? "1.0.0",
    isProduction: process.env.NODE_ENV === "production",
    otelMetricExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

import express from "express";
import opentelemetry from "@opentelemetry/api";
import { createYoga } from "graphql-yoga";
import { schema } from "./schema";

async function start() {
    const { PORT } = process.env;

    const yoga = createYoga({ schema });
    const testCounter = opentelemetry.metrics
        .getMeter("default")
        .createCounter("hello-world");
    const port = PORT || 4000;

    const app = express();

    app.get("/", (_req, res) => {
        testCounter.add(1);
        res.send("Hello World");
    });

    app.post("/graphql", (req, res) => yoga.handle(req, res));

    app.listen(port);
    console.log(`server ready at http://localhost:${port}`);
}

start().catch((e) => {
    console.error(e);
});
