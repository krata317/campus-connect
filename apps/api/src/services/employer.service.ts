import type { EmployerApprovalStatus } from '@campusconnect/shared';
import { employerRepository, type EmployerDetail } from '../repositories/employer.repository';
import { requestRepository } from '../repositories/request.repository';
import { notFound } from '../lib/errors';

export const employerService = {
  async getMyCompany(employerId: string, collegeId: string): Promise<EmployerDetail> {
    const detail = await employerRepository.getDetail(employerId, collegeId);
    if (!detail) throw notFound('Recruiter company profile not found');
    return detail;
  },

  async updateCompany(
    employerId: string,
    collegeId: string,
    payload: {
      name: string;
      website: string | null;
      contactPersonName: string;
      contactPhone: string;
      contactEmail: string;
      description: string | null;
    },
  ): Promise<EmployerDetail> {
    const updated = await employerRepository.updateCompany(employerId, collegeId, payload);
    if (!updated) throw notFound('Recruiter company profile not found');
    return this.getMyCompany(employerId, collegeId);
  },

  async listRequests(employerId: string, collegeId: string) {
    return requestRepository.list({ collegeId, employerId, status: null, q: '' });
  },

  async listEmployers(params: { collegeId: string; status: EmployerApprovalStatus | null; q: string }): Promise<EmployerDetail[]> {
    return employerRepository.list(params);
  },

  async getEmployerDetail(employerId: string, collegeId: string): Promise<EmployerDetail> {
    const detail = await employerRepository.getDetail(employerId, collegeId);
    if (!detail) throw notFound('Recruiter not found');
    return detail;
  },

  async review(adminId: string, collegeId: string, employerId: string, action: 'APPROVE' | 'REJECT', note: string | null) {
    const result = await employerRepository.setApprovalStatus({
      employerId,
      collegeId,
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      note,
      adminId,
    });
    if (!result) throw notFound('Recruiter not found');
    return this.getEmployerDetail(employerId, collegeId);
  },

  async approvalStatus(employerId: string, collegeId: string): Promise<EmployerApprovalStatus> {
    const status = await employerRepository.getApprovalStatus(employerId, collegeId);
    if (!status) throw notFound('Recruiter account not found');
    return status;
  },
};
