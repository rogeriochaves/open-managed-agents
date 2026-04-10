{{/*
Expand the name of the chart.
*/}}
{{- define "oma.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this.
*/}}
{{- define "oma.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "oma.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "oma.labels" -}}
helm.sh/chart: {{ include "oma.chart" . }}
{{ include "oma.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels (shared)
*/}}
{{- define "oma.selectorLabels" -}}
app.kubernetes.io/name: {{ include "oma.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Server selector labels
*/}}
{{- define "oma.server.selectorLabels" -}}
{{ include "oma.selectorLabels" . }}
app.kubernetes.io/component: server
{{- end }}

{{/*
Web selector labels
*/}}
{{- define "oma.web.selectorLabels" -}}
{{ include "oma.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Server image
*/}}
{{- define "oma.server.image" -}}
{{- $tag := default .Chart.AppVersion .Values.server.image.tag }}
{{- printf "%s:%s" .Values.server.image.repository $tag }}
{{- end }}

{{/*
Web image
*/}}
{{- define "oma.web.image" -}}
{{- $tag := default .Chart.AppVersion .Values.web.image.tag }}
{{- printf "%s:%s" .Values.web.image.repository $tag }}
{{- end }}

{{/*
Secret name — use existing or chart-managed
*/}}
{{- define "oma.secretName" -}}
{{- if .Values.server.existingSecret }}
{{- .Values.server.existingSecret }}
{{- else }}
{{- include "oma.fullname" . }}-secret
{{- end }}
{{- end }}

{{/*
PVC name — use existing or chart-managed
*/}}
{{- define "oma.pvcName" -}}
{{- if .Values.persistence.existingClaim }}
{{- .Values.persistence.existingClaim }}
{{- else }}
{{- include "oma.fullname" . }}-data
{{- end }}
{{- end }}
