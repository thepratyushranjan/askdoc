import { X, ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import type { AuditReport } from '../api';

interface AuditModalProps {
  report: AuditReport | null;
  isOpen: boolean;
  onClose: () => void;
}

function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'high':
    case 'critical':
      return 'severity-high';
    case 'medium':
    case 'moderate':
      return 'severity-medium';
    case 'low':
    case 'info':
      return 'severity-low';
    default:
      return 'severity-low';
  }
}

function SeverityIcon({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  if (s === 'high' || s === 'critical') return <ShieldAlert size={16} />;
  if (s === 'medium' || s === 'moderate') return <Info size={16} />;
  return <ShieldCheck size={16} />;
}

export function AuditModal({ report, isOpen, onClose }: AuditModalProps) {
  if (!isOpen || !report) return null;

  const highCount = report.findings.filter(f => ['high', 'critical'].includes(f.severity.toLowerCase())).length;
  const medCount = report.findings.filter(f => ['medium', 'moderate'].includes(f.severity.toLowerCase())).length;
  const lowCount = report.findings.filter(f => !['high', 'critical', 'medium', 'moderate'].includes(f.severity.toLowerCase())).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🛡️ Risk Audit Report</h2>
          <button className="ghost-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {/* Summary bar */}
          <div className="audit-summary">
            <span className="audit-summary-total">{report.findings.length} finding{report.findings.length !== 1 ? 's' : ''}</span>
            <div className="audit-summary-counts">
              {highCount > 0 && <span className="audit-count severity-high">{highCount} High</span>}
              {medCount > 0 && <span className="audit-count severity-medium">{medCount} Medium</span>}
              {lowCount > 0 && <span className="audit-count severity-low">{lowCount} Low</span>}
            </div>
          </div>

          {report.findings.length === 0 ? (
            <div className="audit-empty">
              <ShieldCheck size={32} />
              <p>No risk findings detected. The document appears to be low-risk.</p>
            </div>
          ) : (
            <div className="audit-findings">
              {report.findings.map((finding, i) => (
                <div key={i} className={`audit-finding ${severityColor(finding.severity)}`}>
                  <div className="audit-finding-header">
                    <div className="audit-finding-type">
                      <SeverityIcon severity={finding.severity} />
                      <span>{finding.clause_type}</span>
                    </div>
                    <span className={`audit-severity-badge ${severityColor(finding.severity)}`}>
                      {finding.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="audit-finding-evidence">
                    <span className="evidence-label">Evidence:</span>
                    <q>{finding.evidence}</q>
                  </div>
                  <div className="audit-finding-explanation">
                    {finding.explanation}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
