import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  addActivity,
  updateActivity,
  deleteActivity,
  getSchedule,
  getPert,
  getEvm,
  addEvmSnapshot,
  deleteEvmSnapshot,
} from '../controllers/projectController.js';

const router = Router();

// Projects
router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

// Activities
router.post('/:id/activities', addActivity);
router.put('/:id/activities/:activityId', updateActivity);
router.delete('/:id/activities/:activityId', deleteActivity);

// OR analytics
router.get('/:id/schedule', getSchedule); // CPM
router.get('/:id/pert', getPert); // PERT

// Earned Value Management
router.get('/:id/evm', getEvm);
router.post('/:id/evm', addEvmSnapshot);
router.delete('/:id/evm/:snapshotId', deleteEvmSnapshot);

export default router;
