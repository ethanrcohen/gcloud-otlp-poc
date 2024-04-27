import { MetricExporter as GCPMetricExporter } from "@google-cloud/opentelemetry-cloud-monitoring-exporter";
import { TraceExporter as GCPTraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { CloudPropagator } from "@google-cloud/opentelemetry-cloud-trace-propagator";
import { GcpDetectorSync } from "@google-cloud/opentelemetry-resource-util";
import opentelemetry from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { Resource } from "@opentelemetry/resources";
import {
    Aggregation,
    ConsoleMetricExporter,
    InstrumentType,
    MeterProvider,
    PeriodicExportingMetricReader,
    View,
} from "@opentelemetry/sdk-metrics";
import {
    BatchSpanProcessor,
    SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

interface OpenTelemetryInputs {
    serviceName: string;
    version: string;
    isProduction?: boolean;
    otelMetricExporterEndpoint?: string;
}

export const initializeOpenTelemetry = ({
    serviceName,
    version,
    isProduction = false,
    otelMetricExporterEndpoint,
}: OpenTelemetryInputs): void => {
    const contextManager = new AsyncHooksContextManager().enable();
    opentelemetry.context.setGlobalContextManager(contextManager);

    const resource = Resource.default()
        .merge(
            new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
                [SemanticResourceAttributes.SERVICE_VERSION]: version,
            })
        )
        .merge(new GcpDetectorSync().detect());
    const tracerProvider = new NodeTracerProvider({
        resource,
    });
    const readers = isProduction
        ? [
              new PeriodicExportingMetricReader({
                  exportIntervalMillis: 60_000,
                  exporter: new OTLPMetricExporter({
                      url: otelMetricExporterEndpoint,
                  }),
              }),
              new PeriodicExportingMetricReader({
                  exportIntervalMillis: 60_000,
                  exporter: new GCPMetricExporter(),
              }),
          ]
        : [
              new PeriodicExportingMetricReader({
                  exportIntervalMillis: 60_000,
                  exporter: new ConsoleMetricExporter(),
              }),
          ];

    const meterProvider = new MeterProvider({
        resource,
        views: [
            new View({
                aggregation: Aggregation.ExponentialHistogram(),
                instrumentType: InstrumentType.HISTOGRAM,
                instrumentName: "http.client.duration",
            }),
        ],
        readers,
    });

    if (isProduction) {
        tracerProvider.addSpanProcessor(
            new BatchSpanProcessor(new GCPTraceExporter())
        );
    } else {
        tracerProvider.addSpanProcessor(
            new SimpleSpanProcessor(new OTLPTraceExporter())
        );
    }

    registerInstrumentations({
        tracerProvider: tracerProvider,
        meterProvider: meterProvider,
        instrumentations: [
            new HttpInstrumentation(),
            new ExpressInstrumentation(),
            new GraphQLInstrumentation(),
        ],
    });

    tracerProvider.register({
        propagator: isProduction ? new CloudPropagator() : undefined,
    });
    opentelemetry.metrics.setGlobalMeterProvider(meterProvider);
};
