import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const otelCollectorPort = 4318;
const envs = [
    {
        name: "SERVICE_NAME",
        value: "test-service",
    },
    {
        name: "SERVICE_VERSION",
        value: "1.0.0",
    },
    {
        name: "OTEL_EXPORTER_OTLP_ENDPOINT",
        value: `http://localhost:${otelCollectorPort}`,
    },
];

const sideCarContainer: gcp.types.input.cloudrunv2.ServiceTemplateContainer = {
    image: "us-east1-docker.pkg.dev/infra-pocs/run-otel/otel-collector-metrics:latest",
    name: "otel-collector",
    startupProbe: {
        httpGet: {
            path: "/",
            port: 13133,
        },
    },
    livenessProbe: {
        httpGet: {
            path: "/",
            port: 13133,
        },
    },
    ports: [],
    envs: [
        {
            name: "PORT",
            value: "4318",
        },
    ],
};
const serviceContainer: gcp.types.input.cloudrunv2.ServiceTemplateContainer = {
    image: "us-east1-docker.pkg.dev/infra-pocs/run-otel/sample-metrics-app:latest",
    envs,
    livenessProbe: {
        httpGet: {
            path: "/",
            port: 4000,
        },
    },
    dependsOns: ["otel-collector"],
    startupProbe: {
        timeoutSeconds: 240,
        periodSeconds: 240,
        tcpSocket: {
            port: 4000,
        },
    },
    ports: [{ containerPort: 4000 }],
    volumeMounts: [],
    resources: {
        startupCpuBoost: true,
        cpuIdle: true,
        limits: {
            memory: "1024Mi",
        },
    },
};

const service = new gcp.cloudrunv2.Service("service", {
    name: "test-service",
    location: "us-east1",
    ingress: "INGRESS_TRAFFIC_ALL",
    template: {
        containers: [sideCarContainer, serviceContainer],
        scaling: {
            minInstanceCount: 0,
            maxInstanceCount: 2,
        },
        volumes: [],
    },
    traffics: [
        {
            type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
            percent: 100,
        },
    ],
});

const serviceIam = new gcp.cloudrunv2.ServiceIamMember("service-iam", {
    location: "us-east1",
    name: service.name,
    role: "roles/run.invoker",
    member: "allUsers",
});

export const url = service.uri;
service.uri.apply((s) => console.log(`Service URL: ${s}`));
