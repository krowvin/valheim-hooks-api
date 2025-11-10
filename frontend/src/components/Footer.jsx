import { useQuery } from "@tanstack/react-query";
import { Container } from "react-bootstrap";
import { fetchVersion } from "../js/api.js";
import dayjs from "dayjs";

export default function Footer() {
  const build = useQuery({
    queryKey: ["valheim", "build"],
    queryFn: fetchVersion,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  console.log(build.data);

  return (
    <footer className="mt-5 text-center text-secondary small">
      <Container>
        <div className="mb-1 text-white">
          <span>Valheim Log Hooks Dashboard &mdash; </span>
          <a
            href="https://github.com/krowvin/valheim-hooks-api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white"
          >
            GitHub Repository
          </a>
        </div>

        <div className="text-secondary">
          {build.isLoading ? (
            "Loading version..."
          ) : build.error ? (
            <span title={String(build.error)}>Build: unknown</span>
          ) : (
            <span title={"Built at " + dayjs(build.data?.builtAt).toString()}>
              Build {build.data?.version}
              {build.data?.shortSha ? (
                <> &middot; {build.data.shortSha}</>
              ) : null}
            </span>
          )}
        </div>
      </Container>
    </footer>
  );
}
