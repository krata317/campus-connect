import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SkillSummary } from '@campusconnect/shared';
import { Checkbox, Input } from '@/components/ui/form';

export const SkillPicker = ({
  skills,
  required,
  optional,
  onChange,
}: {
  skills: SkillSummary[];
  required: string[];
  optional: string[];
  onChange: (next: { requiredSkillIds: string[]; optionalSkillIds: string[] }) => void;
}) => {
  const [search, setSearch] = useState('');

  const activeSkills = useMemo(() => skills.filter((skill) => skill.active), [skills]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? activeSkills.filter((skill) => skill.name.toLowerCase().includes(query)) : activeSkills;
  }, [activeSkills, search]);

  const setRequired = (id: string, checked: boolean) => {
    if (checked) {
      onChange({ requiredSkillIds: [...required, id], optionalSkillIds: optional.filter((item) => item !== id) });
      return;
    }
    onChange({ requiredSkillIds: required.filter((item) => item !== id), optionalSkillIds: optional });
  };

  const setOptional = (id: string, checked: boolean) => {
    if (checked) {
      onChange({ requiredSkillIds: required.filter((item) => item !== id), optionalSkillIds: [...optional, id] });
      return;
    }
    onChange({ requiredSkillIds: required, optionalSkillIds: optional.filter((item) => item !== id) });
  };

  if (activeSkills.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted px-3 py-4 text-sm text-muted-foreground">
        The college has not added any skills to the catalogue yet. You can still submit the role without skill requirements.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the skill catalogue" className="pl-8" />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Skill</th>
              <th className="w-24 px-3 py-2 text-center font-semibold">Required</th>
              <th className="w-24 px-3 py-2 text-center font-semibold">Preferred</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  No skills match “{search}”.
                </td>
              </tr>
            ) : (
              visible.map((skill) => (
                <tr key={skill.id} className="bg-white">
                  <td className="px-3 py-1.5">{skill.name}</td>
                  <td className="px-3 py-1.5 text-center">
                    <Checkbox
                      checked={required.includes(skill.id)}
                      onChange={(event) => setRequired(skill.id, event.target.checked)}
                      aria-label={`${skill.name} required`}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <Checkbox
                      checked={optional.includes(skill.id)}
                      onChange={(event) => setOptional(skill.id, event.target.checked)}
                      aria-label={`${skill.name} preferred`}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {required.length} required · {optional.length} preferred. Preferred skills are shown to the placement cell but are not
        required for eligibility.
      </p>
    </div>
  );
};
