import { useState, useEffect } from 'react';
import { getTasks, updateTask, runTaskNow } from '../../services/api';
import type { ScheduledTask } from '../../types';

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

  return (
    <div className="schedule-manager">
      <h4>스케줄 관리</h4>
      <table className="table">
        <thead>
          <tr>
            <th>작업</th>
            <th>Cron</th>
            <th>다음 실행</th>
            <th>상태</th>
            <th>실행</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{task.name}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
