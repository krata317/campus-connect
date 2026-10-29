import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { StudentProfile } from '@campusconnect/shared';
import { Alert, EmptyState, LoadingState, Spinner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { profileQueryKey, useSkillCatalogue } from '@/hooks/useStudent';

export const SkillsForm = ({ profile }: { profile: StudentProfile }) => {
  const queryClient = useQueryClient();
  const catalogue = useSkillCatalogue();
  const [selected, setSelected] = useState<string[]>(profile.skills.map((skill) => skill.id));
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSelected(profile.skills.map((skill) => skill.id));
  }, [profile.skills]);

  const activeSkills = useMemo(() => (catalogue.data ?? []).filter((skill) => skill.active), [catalogue.data]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? activeSkills.filter((skill) => skill.name.toLowerCase().includes(query)) : activeSkills;
  }, [activeSkills, search]);

  const save = useMutation({
    mutationFn: () => api.put<{ profile: StudentProfile }>('/student/me/skills', { skillIds: selected }),
    onSuccess: (data) => {
      queryClient.setQueryData(profileQueryKey, data.profile);
      queryClient.invalidateQueries({ queryKey: ['student'] });
    },
  });

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  if (catalogue.isLoading) return <LoadingState label="Loading skill catalogue" />;

  if (catalogue.isError) {
    return <Alert tone="error">{errorMessage(catalogue.error)}</Alert>;
  }

  if (activeSkills.length === 0) {
    return (
      <EmptyState
        title="The skill catalogue is empty"
        description="A placement administrator needs to add skills before students can select them. This keeps skill names consistent for eligibility matching."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search skills" className="pl-8" />
        </div>
        <p className="text-sm text-muted-foreground">
          {selected.length} selected of {activeSkills.length}
        </p>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-card p-3">
        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">No skills match “{search}”.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((skill) => (
              <label
                key={skill.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={selected.includes(skill.id)} onChange={() => toggle(skill.id)} />
                <span className="truncate">{skill.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">Skills updated.</Alert> : null}

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          Save skills
        </Button>
      </div>
    </div>
  );
};
