---
layout: home
title: TypeTorch
description: TypeTorch is a roblox-ts framework and toolchain that hot-swaps every live Roblox server to a new build in seconds, without restarts, while players stay in the game.
titleTemplate: Update live Roblox games without restarting their servers

hero:
  name: TypeTorch
  text: Update live Roblox games without restarting their servers
  tagline: You write the game in roblox-ts. Each build becomes one artifact, and every live server hot-swaps to it in a few seconds while players stay in the game.
  image:
    src: /brand/typetorch.svg
    alt: TypeTorch logo
  actions:
    - theme: brand
      text: Get started
      link: /getting-started/fresh-setup
    - theme: alt
      text: Is it for me?
      link: /getting-started/is-it-for-me
    - theme: alt
      text: Live demo
      link: https://demo.typetorch.dev
    - theme: alt
      text: Migrate
      link: /getting-started/migrate
    - theme: alt
      text: GitHub
      link: https://github.com/typetorch

features:
  - title: Hot-swap without restarts
    details: Each build is uploaded once as a private Model asset. Live servers load it, stop the old version and start the new one on the server and the clients, with no restart.
    link: /guides/deploy-and-rollback
    linkText: Deploy and rollback
  - title: Branches in one place
    details: Public servers run <code>prod</code>. Any other branch (<code>dev</code>, <code>feature-x</code>) runs in private or reserved servers of the same game.
    link: /guides/branches-and-channels
    linkText: Branches and channels
  - title: Safe deploys
    details: A cloud test before every prod publish, signed prod builds, a health window on each server that rolls a failing build back, and <code>deploy --wait</code>, which rolls the branch back when a build fails on 20% of servers.
    link: /guides/prod-signing
    linkText: Prod signing
  - title: A roblox-ts framework
    details: "<code>@typetorch/framework</code>: modules with dependency injection and lifecycle hooks, troves for cleanup, guarded networking, UI helpers, hot assets and the in-game dev menu. It ships inside every payload, so it hot-swaps too."
    link: /reference/framework
    linkText: Framework reference
  - title: The Studio loop
    details: <code>typetorch serve</code> and the Studio plugin run your local code with the real kernel. Studio attaches by itself, reloads a running playtest on save, publishes hot assets from a panel, and has a Claude tab (<code>serve --claude</code>).
    link: /guides/studio-testing
    linkText: Testing in Studio
  - title: Optional self-hosted backend
    details: Live server status, deploy reports, alerts, error logs and debug bundles from the kernel, live debug of one server, your own analytics with experiments, funnels and first-session recordings, notifications, feedback, live events, and a web explorer.
    link: /guides/fleet-and-alerts
    linkText: Live servers and alerts
---

<div class="home-demo">

## See the backend explorer

The optional backend comes with a web explorer for live servers, deploys, errors and your own analytics.
Try it in the [live demo](https://demo.typetorch.dev): anonymized sample data from a real game, running entirely in
your browser, with you signed in as an owner.

[![The explorer's Overview page in the live demo: players, sessions and playtime per day, with deploy markers](/screenshots/overview.png)](https://demo.typetorch.dev)

</div>
