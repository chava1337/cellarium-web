import type { Language } from '../contexts/LanguageContext';
import { getReportPdfLabelsForLanguage, type ReportPdfLabels } from '../i18n/pdfReportI18n';
import { getAppLocaleTag } from './appLocale';

export interface ReportPdfContext {
  localeTag: string;
  labels: ReportPdfLabels;
}

export function buildReportPdfContext(language: Language): ReportPdfContext {
  return {
    localeTag: getAppLocaleTag(language),
    labels: getReportPdfLabelsForLanguage(language),
  };
}

export function formatReportDate(localeTag: string, date: Date = new Date()): string {
  return date.toLocaleDateString(localeTag, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatReportDateTime(localeTag: string, date: Date = new Date()): string {
  return date.toLocaleString(localeTag);
}
