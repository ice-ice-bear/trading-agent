import { useState, useEffect } from 'react';
import { getTasks, updateTask, runTaskNow } from '../../services/api';
import type { ScheduledTask } from '../../types';

const AGENT_LABELS: Record<string, { name: string; icon: string }> = {
  portfolio_monitor: { name: '포트폴리오 모니터', icon: '📊' },
  market_scanner: { name: '마켓 스캐너', icon: '🔍' },
  trading_executor: { name: '매매 실행기', icon: '⚡' },
  risk_manager: { name: '리스크 관리자', icon: '🛡️' },
  report_generator: { name: '리포트 생성기', icon: '📝' },
};

const TASK_LABELS: Record<string, string> = {
  portfolio_check: '잔고 확인',
  morning_scan: '오전 스캔',
  midday_scan: '점심 스캔',
  afternoon_scan: '오후 스캔',
  closing_check: '장마감 체크',
  daily_report: '일간 리포트',
  weekly_report: '주간 리포트',
};

export default function ScheduleManager() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [cronInput, setCronInput] = useState('');
  const [running, setRunning] = useState<number | null>(null);

  const fetchTasks = async () => {
    try {
      const res = await getTasks();
      setTasks(res.tasks);
    } catch { /* silent */ }
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleToggle = async (task: ScheduledTask) => {
    await updateTask(task.id, { enabled: !task.enabled });
    fetchTasks();
  };

  const handleSaveCron = async (taskId: number) => {
    if (!cronInput.trim()) return;
    await updateTask(taskId, { cron_expression: cronInput });
    setEditing(null);
    fetchTasks();
  };

  const handleRunNow = async (taskId: number) => {
    setRunning(taskId);
    try {
      await runTaskNow(taskId);
    } catch { /* silent */ }
    finally {
      setRunning(null);
      fetchTasks();
    }
  };

  // cron 시간순 정렬: 시(hour) → 분(minute) 기준
  const sortedTasks = [...tasks].sort((a, b) => {
    const parseCron = (cron: string) => {
      const parts = cron.split(/\s+/);
      const min = parts[0] === '*' ? 0 : parseInt(parts[0]?.replace('*/', '') || '0', 10);
      const hour = parts[1] === '*' ? 0 : parseInt(parts[1]?.split('-')[0]?.replace('*/', '') || '0', 10);
      return hour * 60 + min;
    };
    return parseCron(a.cron_expression) - parseCron(b.cron_expression);
  });

  return (
    <div className="schedule-manager">
      <h4>스케줄 관리</h4>
      <table className="table">
        <thead>
          <tr>
            <th>작업</th>
            <th>에이전트</th>
            <th>Cron</th>
            <th>다음 실행</th>
            <th>상태</th>
            <th>실행</th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => {
            const agent = AGENT_LABELS[task.agent_id] || { name: task.agent_id, icon: '⚙️' };
            const taskLabel = TASK_LABELS[task.name] || task.name;
            return (
            <tr key={task.id}>
              <td>
                <div>{taskLabel}</div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>{task.name}</div>
              </td>
              <td>
                <span title={task.agent_id}>{agent.icon} {agent.name}</span>
              </td>
              <td>
                {editing === task.id ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      value={cronInput}
                      onChange={(e) => setCronInput(e.target.value)}
                      style={{ width: '120px' }}
                      placeholder="*/30 * * * *"
                    />
                    <button className="btn btn-sm btn-primary" onClick={() => handleSaveCron(task.id)}>저장</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>취소</button>
                  </div>
                ) : (
                  <code
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setEditing(task.id); setCronInput(task.cron_expression); }}
                    title="클릭하여 편집"
                  >
                    {task.cron_expression}
                  </code>
                )}
              </td>
              <td className="text-muted">{task.next_run_computed || '-'}</td>
              <td>
                <button
                  className={`btn btn-sm ${task.enabled ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleToggle(task)}
                >
                  {task.enabled ? 'ON' : 'OFF'}
                </button>
              </td>
              <td>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleRunNow(task.id)}
                  disabled={running === task.id}
                >
                  {running === task.id ? '실행 중...' : '즉시 실행'}
                </button>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
