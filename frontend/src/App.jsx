import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Col,
  Container,
  ListGroup,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import dayjs from "dayjs";

import { fetchStatus, fetchOnline, fetchRaids } from "./js/api.js";
import Footer from "./components/Footer.jsx";

const POLL_MS = 15000;

export default function App() {
  const qc = useQueryClient();

  const server = useQuery({
    queryKey: ["valheim", "server"],
    queryFn: fetchStatus,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const players = useQuery({
    queryKey: ["valheim", "player"],
    queryFn: fetchOnline,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const raids = useQuery({
    queryKey: ["valheim", "raids"],
    queryFn: fetchRaids,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const isLoading = server.isLoading || players.isLoading || raids.isLoading;
  const isFetching =
    server.isFetching || players.isFetching || raids.isFetching;
  const error = players.error || server.error || raids.error;

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["valheim"] });
  };

  return (
    <div className="min-vh-100 bg-dark text-light">
      <div
        className="py-5 text-center position-relative"
        style={{
          background:
            "linear-gradient(rgba(193,161,100,.10), rgba(0,0,0,0.0) 60%), radial-gradient(1200px 600px at 10% 0%, #1a1e22 0%, #0d1013 60%, #080a0c 100%)",
          borderBottom: "1px solid rgba(255,255,255,.06)",
        }}
      >
        <Container>
          <h1
            className="display-5 fw-bold"
            style={{ fontFamily: "serif", letterSpacing: ".5px" }}
          >
            Charlie&apos;s Valheim Server
          </h1>
          <p className="lead text-secondary">
            Skål! Brave warriors gather here.
          </p>
        </Container>
      </div>

      <Container className="py-4">
        <Row className="g-4">
          <Col lg={8}>
            <Card bg="dark" text="light" className="shadow-sm border-secondary">
              <Card.Header className="d-flex align-items-center gap-2">
                <span className="me-auto">
                  <span className="text-secondary me-2">Server</span>
                  <Badge bg="secondary" className="me-1">
                    {server.data?.serverName || server.data?.name || "Valheim"}
                  </Badge>
                </span>

                <Button
                  variant="outline-light"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  title="Refresh"
                >
                  {isFetching ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      Refreshing
                    </>
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </Card.Header>

              <Card.Body>
                <Row className="g-3 mb-3">
                  <Col sm={6} md="auto">
                    <Card
                      bg="black"
                      text="light"
                      className="border-secondary h-100"
                    >
                      <Card.Body className="py-2">
                        <div className="small text-secondary">Online</div>
                        <div className="fs-4">
                          {players.data?.count ?? 0}
                          {players.data?.maxCount != null ? (
                            <span className="text-secondary">
                              {" "}
                              / {players.data.maxCount}
                            </span>
                          ) : null}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col sm={6} md="auto">
                    <Card
                      bg="black"
                      text="light"
                      className="border-secondary h-100"
                    >
                      <Card.Body className="py-2">
                        <div className="small text-secondary">Auto-refresh</div>
                        <div className="fs-5">
                          {Math.round(POLL_MS / 1000)}s
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                {isLoading ? (
                  <div className="d-flex align-items-center gap-2">
                    <Spinner animation="border" />
                    <span className="text-secondary">Summoning ravens…</span>
                  </div>
                ) : error ? (
                  <div className="alert alert-danger mb-0">
                    Couldn&apos;t reach the longhouse:{" "}
                    <code>{String(error.message || error)}</code>
                  </div>
                ) : players.data.length === 0 ? (
                  <div className="alert alert-secondary text-secondary mb-0">
                    No vikings online. The mead is warm and the hearth is lit.
                    Check back soon.
                  </div>
                ) : (
                  <ListGroup
                    variant="flush"
                    className="rounded overflow-hidden"
                  >
                    {players.data &&
                      players.data.players.map((p, i) => (
                        <ListGroup.Item
                          key={p.id || i}
                          className="bg-dark text-light border-secondary d-flex align-items-center"
                        >
                          <div
                            className="rounded me-3 d-flex align-items-center justify-content-center"
                            style={{
                              width: 44,
                              height: 44,
                              border: "1px solid rgba(255,255,255,.15)",
                              background:
                                "linear-gradient(135deg, #262b31, #1a1f24)",
                              fontFamily: "serif",
                              fontWeight: 800,
                              color: "#c1a164",
                            }}
                            aria-hidden
                          >
                            {(p.id || "V")?.toString()?.[0]?.toUpperCase() ||
                              "V"}
                          </div>
                          <div className="flex-grow-1">
                            <div className="fw-semibold">
                              {p.id || "Unknown Viking"}
                            </div>
                            <div className="small text-secondary">
                              {p.joinedAt
                                ? `Joined ${new Date(
                                    p.joinedAt
                                  ).toLocaleTimeString()}`
                                : p.timeSeconds > 0
                                ? `Session: ${fmtDuration(p.timeSeconds)}`
                                : "Exploring the realms"}
                            </div>
                          </div>
                        </ListGroup.Item>
                      ))}
                  </ListGroup>
                )}
              </Card.Body>

              <Card.Footer className="text-end text-secondary small">
                Last updated:{" "}
                {server.data?.updatedAt
                  ? new Date(server.data.updatedAt).toLocaleTimeString()
                  : "—"}
              </Card.Footer>
            </Card>
          </Col>

          <Col lg={4}>
            <Card bg="dark" text="light" className="shadow-sm border-secondary">
              <Card.Header className="d-flex align-items-center">
                <span className="me-auto">Server Status</span>
                <Badge bg={statusVariant(server.data?.current?.status)}>
                  {prettyStatus(server.data?.current?.status) || "unknown"}
                </Badge>
              </Card.Header>

              <Card.Body className="pt-3">
                <div className="mb-3">
                  <div className="small text-white mb-1">Currently</div>
                  <div className="d-flex align-items-start gap-2">
                    <div
                      className="rounded-circle flex-shrink-0"
                      style={{
                        width: 10,
                        height: 10,
                        marginTop: 7,
                        backgroundColor: statusDot(
                          server.data?.current?.status
                        ),
                      }}
                    />
                    <div className="flex-grow-1">
                      <div className="fw-semibold">
                        {prettyStatus(server.data?.current?.status) ||
                          "Unknown"}
                        {" - "}
                        <span className="small text-secondary">
                          {server.data?.current?.at &&
                            dayjs(server.data.current.at).calendar()}
                        </span>
                      </div>
                      <div className="small text-secondary">
                        {server.data?.current?.detail || "—"}
                      </div>
                      <div className="small text-muted">
                        {server.data?.current?.at
                          ? new Date(server.data.current.at).toLocaleString()
                          : ""}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="small text-secondary mb-1">History</div>
                  <div
                    className="border border-secondary rounded overflow-auto"
                    style={{ maxHeight: 260, background: "#0f1317" }}
                  >
                    <ListGroup variant="flush">
                      {(server.data?.history || []).map((h, idx) => (
                        <ListGroup.Item
                          key={idx}
                          className="bg-dark text-light border-secondary d-flex align-items-start"
                        >
                          <div
                            className="rounded-circle flex-shrink-0 me-2"
                            style={{
                              width: 8,
                              height: 8,
                              marginTop: 6,
                              backgroundColor: statusDot(h.status),
                            }}
                          />
                          <div className="flex-grow-1">
                            <div className="d-flex justify-content-between">
                              <span className="fw-semibold">
                                {prettyStatus(h.status)}
                              </span>
                              <span className="small text-muted">
                                {h.at ? new Date(h.at).toLocaleString() : ""}
                              </span>
                            </div>
                            <div className="small text-secondary">
                              {h.detail || ""}
                            </div>
                          </div>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row className="g-4 mt-1">
          <Col xs={12}>
            <Card bg="dark" text="light" className="shadow-sm border-secondary">
              <Card.Header className="d-flex align-items-center">
                <span className="me-auto">Recent Raids</span>
                <Badge bg="secondary">{raids.data?.count ?? 0}</Badge>
              </Card.Header>
              <Card.Body className="p-0">
                {raids.isLoading ? (
                  <div className="p-3 d-flex align-items-center gap-2">
                    <Spinner animation="border" />
                    <span className="text-secondary">
                      Consulting the ravens…
                    </span>
                  </div>
                ) : raids.error ? (
                  <div className="p-3 alert alert-danger mb-0">
                    Couldn&apos;t fetch raids:{" "}
                    <code>{String(raids.error.message || raids.error)}</code>
                  </div>
                ) : (raids.data?.raids?.length || 0) === 0 ? (
                  <div className="p-3 text-secondary">
                    No raids recorded yet.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <Table
                      striped
                      hover
                      borderless
                      variant="dark"
                      className="mb-0 align-middle"
                    >
                      <thead className="text-secondary">
                        <tr>
                          <th style={{ minWidth: 160 }}>When</th>
                          <th>Raid</th>
                          {/* <th className="d-none d-sm-table-cell">Detail</th> */}
                        </tr>
                      </thead>
                      <tbody>
                        {raids.data.raids.map((r, idx) => (
                          <tr key={idx}>
                            <td>
                              <div className="fw-semibold">
                                {dayjs(r.time).format("MMM D, HH:mm")}
                              </div>
                              <div className="small text-secondary">
                                {dayjs(r.time).fromNow?.() ||
                                  new Date(r.time).toLocaleTimeString()}
                              </div>
                            </td>
                            <td className="text-break">
                              <Badge
                                bg="outline"
                                className="border border-secondary text-light"
                              >
                                {prettyRaid(r.raid)}
                              </Badge>
                            </td>
                            {/* <td className="d-none d-sm-table-cell text-secondary">
                              {r.detail || "—"}
                            </td> */}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card.Body>
              <Card.Footer className="text-end text-secondary small">
                Auto-refresh: {Math.round(POLL_MS / 1000)}s
              </Card.Footer>
            </Card>
          </Col>
        </Row>

        <Footer />
      </Container>
    </div>
  );
}

function statusVariant(status) {
  switch ((status || "").toLowerCase()) {
    case "online":
      return "success";
    case "starting":
    case "updated":
      return "warning";
    case "updating":
      return "info";
    case "shutting_down":
      return "secondary";
    case "offline":
      return "dark";
    default:
      return "secondary";
  }
}

function statusDot(status) {
  switch ((status || "").toLowerCase()) {
    case "online":
      return "#28a745";
    case "starting":
    case "updated":
      return "#ffc107";
    case "updating":
      return "#17a2b8";
    case "shutting_down":
      return "#6c757d";
    case "offline":
      return "#343a40";
    default:
      return "#6c757d";
  }
}

function prettyStatus(status) {
  if (!status) return "Unknown";
  return String(status).replace(/_/g, " ");
}

function prettyRaid(name) {
  const n = String(name || "").trim();
  if (!n) return "unknown";
  return n.replace(/_/g, " ");
}

function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
