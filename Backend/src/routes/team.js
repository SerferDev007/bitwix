import { Router } from 'express';
import multer from 'multer';
import {
  listTeam,
  listAllTeam,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  uploadTeamPhoto,
  deleteTeamPhoto,
} from '../controllers/teamController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// In-memory upload, images only, 5 MB max.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Only image files are allowed.'), { userFacing: true }));
  },
});

// Public: website team list.
router.get('/', listTeam);

// Admin (protected).
router.get('/all', requireAuth, listAllTeam);
router.post('/', requireAuth, createTeamMember);
router.put('/:id', requireAuth, updateTeamMember);
router.delete('/:id', requireAuth, deleteTeamMember);
router.post('/:id/photo', requireAuth, upload.single('photo'), uploadTeamPhoto);
router.delete('/:id/photo', requireAuth, deleteTeamPhoto);

export default router;
