import { X, Users, Calendar, Scale, CreditCard, ShieldCheck, FileSignature, AlertTriangle } from 'lucide-react';
import type { ExtractedData } from '../api';

interface ExtractModalProps {
  data: ExtractedData | null;
  isOpen: boolean;
  onClose: () => void;
}

function FieldRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="extract-field">
      <div className="extract-label">
        {icon && <span className="extract-label-icon">{icon}</span>}
        {label}
      </div>
      <div className="extract-value">{value}</div>
    </div>
  );
}

function Badge({ value, label }: { value: boolean; label: string }) {
  return (
    <span className={`extract-badge ${value ? 'badge-yes' : 'badge-no'}`}>
      {value ? '✓' : '✗'} {label}
    </span>
  );
}

export function ExtractModal({ data, isOpen, onClose }: ExtractModalProps) {
  if (!isOpen || !data) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📋 Extracted Metadata</h2>
          <button className="ghost-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {/* Parties */}
          {data.parties.length > 0 && (
            <div className="extract-section">
              <div className="extract-section-title">
                <Users size={15} /> Parties Involved
              </div>
              <div className="extract-tags">
                {data.parties.map((p, i) => (
                  <span key={i} className="extract-tag">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Key Terms Grid */}
          <div className="extract-grid">
            <FieldRow
              label="Effective Date"
              value={data.effective_date}
              icon={<Calendar size={13} />}
            />
            <FieldRow
              label="Term / Duration"
              value={data.term}
              icon={<Calendar size={13} />}
            />
            <FieldRow
              label="Governing Law"
              value={data.governing_law}
              icon={<Scale size={13} />}
            />
            <FieldRow
              label="Payment Terms"
              value={data.payment_terms}
              icon={<CreditCard size={13} />}
            />
            <FieldRow
              label="Termination"
              value={data.termination}
              icon={<AlertTriangle size={13} />}
            />
            <FieldRow
              label="Indemnity"
              value={data.indemnity}
              icon={<ShieldCheck size={13} />}
            />
            {data.liability_cap && (
              <FieldRow
                label="Liability Cap"
                value={
                  data.liability_cap.value
                    ? `${data.liability_cap.currency ?? '$'}${data.liability_cap.value.toLocaleString()}`
                    : 'Not specified'
                }
                icon={<AlertTriangle size={13} />}
              />
            )}
          </div>

          {/* Booleans */}
          <div className="extract-flags">
            <Badge value={data.auto_renewal} label="Auto Renewal" />
            <Badge value={data.confidentiality} label="Confidentiality" />
          </div>

          {/* Signatories */}
          {data.signatories.length > 0 && (
            <div className="extract-section">
              <div className="extract-section-title">
                <FileSignature size={15} /> Signatories
              </div>
              <div className="extract-tags">
                {data.signatories.map((s, i) => (
                  <span key={i} className="extract-tag">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
