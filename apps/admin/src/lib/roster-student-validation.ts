import { z } from 'zod';

const rosterStudentSchema = z.object({
  firstNameTh: z.string().trim().min(1).max(100),
  lastNameTh: z.string().trim().min(1).max(100),
  studentId: z.string().regex(/^[0-9]{8}$/),
});

export function validateRosterStudent(formData: FormData) {
  const result = rosterStudentSchema.safeParse({
    firstNameTh: formData.get('firstNameTh'),
    lastNameTh: formData.get('lastNameTh'),
    studentId: formData.get('studentId'),
  });
  return result.success ? result.data : null;
}
