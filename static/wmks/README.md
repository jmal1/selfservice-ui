# WMKS SDK Files

This directory should contain the VMware HTML Console SDK (WebMKS) files:

- `wmks.min.js` — The minified WMKS JavaScript library
- `css/wmks-all.css` — WMKS styles

## How to obtain

1. Log into [Broadcom Developer Portal](https://developer.broadcom.com/)
2. Navigate to VMware vSphere SDKs & Tools → HTML Console SDK
3. Download `WebMKS_SDK_2.x.0.zip`
4. Extract `wmks.min.js` into this directory
5. Extract the `css/` folder into this directory

## Alternative

You may also be able to extract these from your vCenter appliance:
```bash
scp root@vcenter.lab.jmal.io:/usr/lib/vmware-vsphere-ui/server/static/resources/js/libs/wmks.min.js .
```

The console page (`/console/[podId]/[vmId]`) loads these files via `<script src="/wmks/wmks.min.js">`.
