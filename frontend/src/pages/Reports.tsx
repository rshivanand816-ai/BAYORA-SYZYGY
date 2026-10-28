import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { EvaluationOut } from '../types/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { ErrorState } from '../components/common/ErrorState';
import { FileCheck2, FileText, Download, RotateCcw } from 'lucide-react';

export const Reports: React.FC = () => {
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<EvaluationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getEvaluations();
      // Filter evaluations that have at least some executions or completed
      setEvaluations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvals();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-[#44D7F2]" />
            <h1 className="text-xl font-bold text-[#E5EAF2]">Evaluation Security Reports</h1>
          </div>
          <p className="text-xs text-[#8FA0BE] mt-1">
            Reproducible audit-grade reports with evidence references, statement classifications, and PDF exports.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchEvals}
          icon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Refresh
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={fetchEvals} />}

      {loading && evaluations.length === 0 ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#233252] bg-[#0E1524] text-[#8FA0BE] text-[10px] uppercase font-mono">
                  <th className="py-3 px-4">Evaluation</th>
                  <th className="py-3 px-4">Target Model</th>
                  <th className="py-3 px-4">Defense Version</th>
                  <th className="py-3 px-4">Probes Executed</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D2942]">
                {evaluations.map((ev) => (
                  <tr
                    key={ev.id}
                    className="hover:bg-[#182238] transition-colors cursor-pointer"
                    onClick={() => navigate(`/reports/${ev.id}`)}
                  >
                    <td className="py-3 px-4 font-semibold text-[#E5EAF2]">
                      <div className="flex items-center gap-1.5">
                        <span>{ev.name}</span>
                        {ev.simulated && <Badge variant="yellow">SIMULATED</Badge>}
                      </div>
                      <div className="text-[10px] text-[#8FA0BE] font-mono mt-0.5">
                        {ev.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#44D7F2]">{ev.model.name}</td>
                    <td className="py-3 px-4 font-mono text-[#5599FF]">v{ev.defense.version}</td>
                    <td className="py-3 px-4 font-mono">
                      {ev.probes_used} / {ev.probe_budget}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={ev.status === 'completed' ? 'green' : 'blue'}>
                        {ev.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[#8FA0BE] text-[11px]">
                      {new Date(ev.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/reports/${ev.id}`);
                        }}
                        icon={<FileText className="w-3.5 h-3.5" />}
                      >
                        View Report
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
