import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import type { HiringRequest, InstituteSummary } from '@campusconnect/shared';
import { Alert, ErrorState, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { RoleFields } from '@/components/recruiter/RoleFields';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { emptyRequest, emptyRole, requestToValues, valuesToPayload, type RequestFormValues } from './requestForm';

export const RecruiterRequestEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [instituteId, setInstituteId] = useState('');

  const institutes = useQuery({
    queryKey: ['institutes', 'public'],
    queryFn: () => api.get<{ items: InstituteSummary[] }>('/institutes').then((response) => response.items),
    staleTime: 60_000,
  });

  const existing = useQuery({
    queryKey: ['recruiter', 'request', id],
    queryFn: () => api.get<{ request: HiringRequest }>(`/recruiter/requests/${id}`).then((response) => response.request),
    enabled: isEdit,
  });

  // The skill catalogue belongs to the institute the request is addressed to.
  const skills = useQuery({
    queryKey: ['institutes', instituteId, 'skills'],
    queryFn: () =>
      api
        .get<{ items: { id: string; name: string }[] }>(`/institutes/${instituteId}/skills`)
        .then((response) => response.items.map((skill) => ({ ...skill, active: true }))),
    enabled: instituteId.length > 0,
    staleTime: 60_000,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RequestFormValues>({ defaultValues: emptyRequest() });

  const { fields, append, remove } = useFieldArray({ control, name: 'roles' });

  useEffect(() => {
    if (existing.data) {
      reset(requestToValues(existing.data));
      setInstituteId(existing.data.instituteId);
    }
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (input: { values: RequestFormValues; submit: boolean }) => {
      const payload = { ...valuesToPayload(input.values), submit: input.submit };
      return isEdit
        ? api.put<{ request: HiringRequest }>(`/recruiter/requests/${id}`, payload)
        : api.post<{ request: HiringRequest }>('/recruiter/requests', { ...payload, instituteId });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recruiter'] });
      navigate(`/recruiter/requests/${data.request.id}`);
    },
  });

  if (isEdit && existing.isLoading) return <LoadingState label="Loading hiring request" />;
  if (isEdit && existing.isError) return <ErrorState message={errorMessage(existing.error)} onRetry={() => existing.refetch()} />;

  if (isEdit && existing.data && existing.data.status !== 'DRAFT' && existing.data.status !== 'CHANGES_REQUESTED') {
    return (
      <div className="space-y-4">
        <PageHeader title="Request locked" />
        <Alert tone="warning">
          This request is {existing.data.status.toLowerCase().replace('_', ' ')} and can no longer be edited. Only drafts and
          requests returned for changes are editable.
        </Alert>
        <Link to={`/recruiter/requests/${id}`} className={cn(buttonVariants({ variant: 'outline' }))}>
          Back to request
        </Link>
      </div>
    );
  }

  const instituteList = institutes.data ?? [];
  const canEdit = Boolean(instituteId);

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit hiring request' : 'New hiring request'}
        description="One request can contain several roles. Each role carries its own eligibility criteria and its own shortlist."
        actions={
          <Link to="/recruiter/requests" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />

      {existing.data?.status === 'CHANGES_REQUESTED' && existing.data.reviewNote ? (
        <Alert tone="warning" title="The placement cell asked for changes">
          {existing.data.reviewNote}
        </Alert>
      ) : null}

      <form className="space-y-4" noValidate onSubmit={(event) => event.preventDefault()}>
        <Card>
          <CardHeader>
            <CardTitle>Recipient and details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Institute"
              htmlFor="instituteId"
              hint={
                isEdit
                  ? 'A request cannot be moved to another institute after it is created.'
                  : 'The request is delivered only to this institute.'
              }
              required
            >
              {isEdit ? (
                <Input id="instituteId" value={existing.data?.instituteName ?? ''} readOnly disabled />
              ) : institutes.isLoading ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground">
                  <Spinner /> Loading institutes
                </div>
              ) : instituteList.length === 0 ? (
                <Alert tone="warning" title="No institute is registered yet">
                  An institute has to register before it can receive hiring requests.
                </Alert>
              ) : (
                <Select
                  id="instituteId"
                  defaultValue=""
                  required
                  value={instituteId}
                  onChange={(event) => setInstituteId(event.target.value)}
                >
                  <option value="" disabled>
                    Choose an institute
                  </option>
                  {instituteList.map((institute) => (
                    <option key={institute.id} value={institute.id}>
                      {institute.name} · {institute.state}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Request title" htmlFor="title" error={errors.title?.message} hint="Internal name, e.g. “Graduate hiring drive — August”" required>
              <Input id="title" {...register('title', { required: 'Request title is required' })} />
            </Field>

            <Field
              label="Assessment or next-step instructions"
              htmlFor="assessmentInstructions"
              error={errors.assessmentInstructions?.message}
              hint="Included in every notification sent to shortlisted students"
            >
              <Textarea id="assessmentInstructions" rows={3} {...register('assessmentInstructions')} />
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {fields.map((field, index) => (
            <RoleFields
              key={field.id}
              index={index}
              register={register}
              errors={errors}
              watch={watch}
              setValue={setValue}
              skills={skills.data ?? []}
              canRemove={fields.length > 1}
              onRemove={() => remove(index)}
            />
          ))}
        </div>

        {!canEdit ? (
          <Alert tone="info">Choose the institute first — the role criteria use that institute’s skill catalogue.</Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={() => append(emptyRole())} disabled={!canEdit}>
            <Plus className="h-3.5 w-3.5" />
            Add another role
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={save.isPending || !canEdit}
              onClick={handleSubmit((values) => save.mutate({ values, submit: false }))}
            >
              {save.isPending ? <Spinner /> : null}
              Save as draft
            </Button>
            <Button
              disabled={save.isPending || !canEdit}
              onClick={handleSubmit((values) => save.mutate({ values, submit: true }))}
            >
              {save.isPending ? <Spinner /> : null}
              Submit for review
            </Button>
          </div>
        </div>

        {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
      </form>
    </div>
  );
};
