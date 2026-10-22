import type { EmployerApprovalStatus } from '@campusconnect/shared';
import { employerRepository, type EmployerDetail } from '../repositories/employer.repository';
import { requestRepository } from '../repositories/request.repository';
import { notFound } from '../lib/errors';

export const employerService = {
  async getMyCompany(employerId: string): Promise<EmployerDetail> {
    const detail = await employerRepository.getDetail(employerId);
    if (!detail) throw notFound('Employer company profile not found');
    return detail;
  },

  async updateCompany(
    employerId: string,
    payload: {
      name: string;
      website: string | null;
      contactPersonName: string;
      contactPhone: string;
      contactEmail: string;
      description: string | null;
    },
  ): Promise<EmployerDetail> {
    const updated = await employerRepository.updateCompany(employerId, payload);
    if (!updated) throw notFound('Employer company profile not found');
    return this.getMyCompany(employerId);
  },

  async listRequests(employerId: string) {
    return requestRepository.list({ employerId, status: null, q: '' });
  },

  async listEmployers(params: { status: EmployerApprovalStatus | null; q: string }): Promise<EmployerDetail[]> {
    return employerRepository.list(params);
  },

  async getEmployerDetail(employerId: string): Promise<EmployerDetail> {
    const detail = await employerRepository.getDetail(employerId);
    if (!detail) throw notFound('Employer not found');
    return detail;
  },

  async review(adminId: string, employerId: string, action: 'APPROVE' | 'REJECT', note: string | null) {
    const result = await employerRepository.setApprovalStatus({
      employerId,
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      note,
      adminId,
    });
    if (!result) throw notFound('Employer not found');
    return this.getEmployerDetail(employerId);
  },

  async approvalStatus(employerId: string): Promise<EmployerApprovalStatus> {
    const status = await employerRepository.getApprovalStatus(employerId);
    if (!status) throw notFound('Employer account not found');
    return status;
  },
};
