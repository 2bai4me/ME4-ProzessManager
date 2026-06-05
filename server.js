// ME4 ProzessManager v0.1 — Server
// Reads Kanban state from SQLite, serves visual dashboard
const express = require('express');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PM_PORT || 3099;

app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API: Get all boards
app.get('/api/boards', (req, res) => {
  try {
    const out = execSync('hermes kanban boards list', { encoding: 'utf8', timeout: 5000 });
    const lines = out.trim().split('\n').filter(l => l.match(/^\s*(●\s*)?[a-z]/));
    const boards = lines.map(line => {
      const parts = line.trim().replace(/^●\s*/, '').split(/\s{2,}/);
      return { slug: parts[0], name: parts[1] || parts[0], counts: parts[2] || '' };
    });
    res.json(boards);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Get tasks for a board
app.get('/api/board/:slug/tasks', (req, res) => {
  try {
    const out = execSync(`hermes kanban --board ${req.params.slug} list`, { encoding: 'utf8', timeout: 5000 });
    const lines = out.split('\n');
    const tasks = [];
    for (const line of lines) {
      const m = line.match(/^([⊘◻▶●✓—])\s+(t_[a-f0-9]+)\s+(\S+)\s+(\S+)\s+(.+)/);
      if (m) {
        const statusMap = { '✓': 'done', '●': 'running', '▶': 'ready', '◻': 'todo', '⊘': 'blocked', '—': 'archived' };
        tasks.push({
          id: m[2],
          status: statusMap[m[1]] || 'unknown',
          statusIcon: m[1],
          assignee: m[4],
          title: m[5]
        });
      }
    }
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Get task detail
app.get('/api/board/:slug/task/:id', (req, res) => {
  try {
    const out = execSync(`hermes kanban --board ${req.params.slug} show ${req.params.id}`, { encoding: 'utf8', timeout: 5000 });
    
    // Parse task detail
    const task = { id: req.params.id, events: [], comments: [] };
    const lines = out.split('\n');
    let inEvents = false, inComments = false;
    
    for (const line of lines) {
      if (line.includes('status:')) task.status = line.split(':')[1]?.trim();
      if (line.includes('assignee:')) task.assignee = line.split(':')[1]?.trim();
      if (line.includes('Latest summary:')) task.summary = line.split('Latest summary:')[1]?.trim();
      if (line.includes('Events (')) inEvents = true;
      if (line.includes('Comments (')) { inEvents = false; inComments = true; }
    }
    
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Post decision/input to unblock a task
app.post('/api/board/:slug/task/:id/decide', (req, res) => {
  try {
    const { decision } = req.body;
    if (!decision) return res.status(400).json({ error: 'decision required' });
    
    execSync(`hermes kanban --board ${req.params.slug} comment ${req.params.id} "Entscheidung: ${decision}"`, { encoding: 'utf8', timeout: 5000 });
    execSync(`hermes kanban --board ${req.params.slug} unblock ${req.params.id}`, { encoding: 'utf8', timeout: 5000 });
    
    res.json({ ok: true, message: 'Task unblocked with decision' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[ProzessManager] http://localhost:${PORT}`);
  console.log(`[ProzessManager] Monitoring Kanban boards...`);
});
