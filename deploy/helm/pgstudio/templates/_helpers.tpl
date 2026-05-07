{{- define "pgstudio.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "pgstudio.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "pgstudio.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "pgstudio.labels" -}}
app.kubernetes.io/name: {{ include "pgstudio.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "pgstudio.databaseUrl" -}}
{{- if .Values.postgres.enabled -}}
{{- printf "postgresql://%s:%s@%s-postgres:5432/%s" .Values.postgres.auth.username (required "postgres.auth.password is required when postgres.enabled=true" .Values.postgres.auth.password) (include "pgstudio.fullname" .) .Values.postgres.auth.database -}}
{{- else -}}
{{- required "secrets.databaseUrl is required when postgres.enabled=false" .Values.secrets.databaseUrl -}}
{{- end -}}
{{- end -}}
