#!/bin/bash

# Load paths and aliases since bashrc doesn't run in a service context.
. ~/.userrc

# Start Sharkey
pnpm run start