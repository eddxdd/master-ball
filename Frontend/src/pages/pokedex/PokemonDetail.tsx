import { Link, useParams } from "react-router";
import { MovepoolTable } from "@/components/MovepoolTable";
import { StatBars } from "@/components/StatBars";
import { TypeBadge } from "@/components/TypeBadge";
import { TypeMatchupChart } from "@/components/TypeMatchupChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePokemonProfile } from "@/hooks/usePokedex";
import type { PokemonProfile } from "@/types/pokemon";

function ProfileSections({ profile }: { profile: PokemonProfile }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Base stats</CardTitle>
        </CardHeader>
        <CardContent>
          <StatBars stats={profile.base_stats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Type matchups</CardTitle>
        </CardHeader>
        <CardContent>
          <TypeMatchupChart matchups={profile.type_matchups} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abilities</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2">
            {profile.abilities.map((ability) => (
              <div key={ability.id}>
                <dt className="font-medium">{ability.name}</dt>
                <dd className="text-muted-foreground text-sm">
                  {ability.description ?? "Description not yet catalogued."}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Natures reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto text-sm">
            {profile.natures.map((nature) => (
              <div key={nature.id} className="flex justify-between gap-2">
                <span>{nature.name}</span>
                <span className="text-muted-foreground">
                  {nature.increased_stat
                    ? `+${nature.increased_stat} / -${nature.decreased_stat}`
                    : "neutral"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Movepool ({profile.learnable_moves.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <MovepoolTable moves={profile.learnable_moves} />
        </CardContent>
      </Card>
    </div>
  );
}

export function PokemonDetail() {
  const { speciesId } = useParams<{ speciesId: string }>();
  const { data: profile, isPending, isError } = usePokemonProfile(speciesId);

  if (isPending) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-destructive">Couldn't find that Pokemon.</p>
        <Link to="/pokedex" className="text-primary underline">
          Back to the Pokedex
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/pokedex" className="text-muted-foreground text-sm underline">
          Back to the Pokedex
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <img src={profile.sprite_url} alt={profile.name} className="h-24 w-24 object-contain" />
        <div>
          <h1 className="text-2xl font-semibold">{profile.name}</h1>
          <p className="text-muted-foreground text-sm">#{profile.num}</p>
          <div className="mt-1 flex gap-1">
            <TypeBadge type={profile.type1} />
            {profile.type2 && <TypeBadge type={profile.type2} />}
          </div>
        </div>
      </div>

      <ProfileSections profile={profile} />

      {profile.mega_formes.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Mega Evolution</h2>
          <p className="text-muted-foreground -mt-3 text-sm">
            Stat and ability changes, computed and shown here directly — no need to mega evolve in a
            real match first to see them.
          </p>
          {profile.mega_formes.map((mega) => (
            <div key={mega.id} className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-4">
                <img src={mega.sprite_url} alt={mega.name} className="h-20 w-20 object-contain" />
                <div>
                  <h3 className="text-lg font-semibold">{mega.name}</h3>
                  <div className="mt-1 flex gap-1">
                    <TypeBadge type={mega.type1} />
                    {mega.type2 && <TypeBadge type={mega.type2} />}
                  </div>
                </div>
              </div>
              <ProfileSections profile={mega} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
