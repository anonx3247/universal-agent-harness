FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo bash coreutils findutils grep sed gawk \
    ca-certificates curl wget git vim nano less fd-find \
    python3 python3-pip python3-venv python3-dev \
    jq xmlstarlet \
    ripgrep

RUN groupadd -g 1001 agent && \
    useradd -u 1001 -g 1001 -m -s /bin/bash agent && \
    echo 'agent ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Create /opt/lean directory for Lean installation (separate from user home volume)
RUN mkdir -p /opt/lean && chown agent:agent /opt/lean

# Install elan (Lean version manager) to /opt/lean
RUN export ELAN_HOME=/opt/lean/.elan && \
    curl https://elan.lean-lang.org/elan-init.sh -sSf | sh -s -- -y --no-modify-path && \
    chown -R agent:agent /opt/lean/.elan

# Create Math project with mathlib in /opt/lean
RUN export ELAN_HOME=/opt/lean/.elan && \
    export PATH="/opt/lean/.elan/bin:$PATH" && \
    cd /opt/lean && \
    lake +leanprover-community/mathlib4:lean-toolchain new Math math && \
    cd Math && lake exe cache get && \
    chown -R agent:agent /opt/lean/Math

# Build Math project
RUN export ELAN_HOME=/opt/lean/.elan && \
    export PATH="/opt/lean/.elan/bin:$PATH" && \
    cd /opt/lean/Math && lake build && \
    chown -R agent:agent /opt/lean/Math

# Install Lean REPL
RUN export ELAN_HOME=/opt/lean/.elan && \
    export PATH="/opt/lean/.elan/bin:$PATH" && \
    cd /opt/lean && \
    git clone https://github.com/leanprover-community/repl.git && \
    cd repl && \
    cp /opt/lean/Math/lean-toolchain . && \
    lake build && \
    chown -R agent:agent /opt/lean/repl

USER agent
WORKDIR /home/agent

RUN python3 -m venv /home/agent/.venv && \
    /home/agent/.venv/bin/pip install --upgrade pip && \
    /home/agent/.venv/bin/pip install \
    numpy pandas matplotlib seaborn plotly

# Set up environment to use Lean from /opt/lean
RUN echo 'export ELAN_HOME=/opt/lean/.elan' >> /home/agent/.bashrc && \
    echo 'export PATH="/opt/lean/.elan/bin:/home/agent/.venv/bin:$PATH"' >> /home/agent/.bashrc && \
    echo 'export PYTHONPATH="/home/agent:$PYTHONPATH"' >> /home/agent/.bashrc && \
    echo 'alias ll="ls -la"' >> /home/agent/.bashrc && \
    echo 'alias la="ls -la"' >> /home/agent/.bashrc && \
    echo '# Lean Math project is at /opt/lean/Math' >> /home/agent/.bashrc && \
    echo '# Lean REPL is at /opt/lean/repl' >> /home/agent/.bashrc && \
    echo 'cd /home/agent' >> /home/agent/.bashrc

CMD ["/bin/bash"]

LABEL maintainer="agent-computer" \
    description="Secure sandbox environment for AI agents with Lean 4 and Mathlib" \
    version="1.2"
