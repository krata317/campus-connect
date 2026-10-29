import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import type { SkillSummary } from '@campusconnect/shared';
import { api, errorMessage } from '@/lib/api';
import { Alert, EmptyState, ErrorState, LoadingState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TD, TH, TBody, THead, TR, Table, TableWrap } from '@/components/ui/table';
import { formatDate } from '@/lib/utils';

interface AdminSkill extends SkillSummary {
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export const InstituteSkillsPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<AdminSkill | null>(null);
  const [editName, setEditName] = useState('');

  const skills = useQuery({
    queryKey: ['institute', 'skills', query],
    queryFn: () => api.get<{ items: AdminSkill[] }>(`/institute/skills?q=${encodeURIComponent(query)}`).then((response) => response.items),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['institute', 'skills'] });

  const create = useMutation({
    mutationFn: (name: string) => api.post<{ skill: AdminSkill }>('/institute/skills', { name }),
    onSuccess: () => {
      setNewName('');
      refresh();
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });

  const update = useMutation({
    mutationFn: (input: { id: string; name?: string; active?: boolean }) =>
      api.patch<{ skill: AdminSkill }>(`/institute/skills/${input.id}`, { name: input.name, active: input.active }),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setEditing(null);
    },
  });

  if (skills.isError) return <ErrorState message={errorMessage(skills.error)} onRetry={() => skills.refetch()} />;

  const items = skills.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Skill catalogue"
        description="Students and recruiters can only choose skills from this list. Deactivating a skill hides it from new selections but keeps existing profile and role links intact."
      />

      <Card>
        <CardContent className="space-y-3">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim().length >= 2) create.mutate(newName.trim());
            }}
          >
            <Field label="Add a skill" htmlFor="newSkill" className="flex-1">
              <Input
                id="newSkill"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Data Structures"
                maxLength={60}
              />
            </Field>
            <Button type="submit" disabled={create.isPending || newName.trim().length < 2}>
              {create.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
              Add skill
            </Button>
          </form>
          {create.isError ? <Alert tone="error">{errorMessage(create.error)}</Alert> : null}
          {create.isSuccess ? <Alert tone="success">Skill added to the catalogue.</Alert> : null}
        </CardContent>
      </Card>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search skills" className="pl-8" />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {update.isError ? <Alert tone="error">{errorMessage(update.error)}</Alert> : null}

      {skills.isLoading ? (
        <LoadingState label="Loading skills" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title={query ? 'No skills match that search' : 'The catalogue is empty'}
              description={
                query
                  ? 'Try a different term.'
                  : 'Add the skills your institute teaches. Students cannot type their own skill names, which keeps eligibility matching reliable.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Skill</TH>
                <TH>Status</TH>
                <TH>Used by</TH>
                <TH>Created</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((skill) => (
                <TR key={skill.id}>
                  <TD className="font-medium text-foreground">{skill.name}</TD>
                  <TD>
                    <Badge variant={skill.active ? 'success' : 'outline'}>{skill.active ? 'Active' : 'Inactive'}</Badge>
                  </TD>
                  <TD className="text-muted-foreground">{skill.usageCount} link(s)</TD>
                  <TD className="text-muted-foreground">{formatDate(skill.createdAt)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Rename ${skill.name}`}
                        onClick={() => {
                          setEditing(skill);
                          setEditName(skill.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: skill.id, active: !skill.active })}
                      >
                        {skill.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <DialogContent
          title="Rename skill"
          description="Renaming updates the label everywhere. Existing student and role links are preserved."
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (editing && editName.trim().length >= 2) update.mutate({ id: editing.id, name: editName.trim() });
            }}
          >
            <Field label="Skill name" htmlFor="editSkillName">
              <Input id="editSkillName" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={60} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={update.isPending || editName.trim().length < 2}>
                {update.isPending ? <Spinner /> : null}
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
