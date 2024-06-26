import { DataAzurermClientConfig } from "@cdktf/provider-azurerm/lib/data-azurerm-client-config";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { ResourceGroup } from "@cdktf/provider-azurerm/lib/resource-group";
import { StorageAccount } from "@cdktf/provider-azurerm/lib/storage-account";
import { Subnet } from "@cdktf/provider-azurerm/lib/subnet";
import { VirtualNetwork } from "@cdktf/provider-azurerm/lib/virtual-network";
import * as cdktf from "cdktf";
import { App } from "cdktf";
import { Construct } from "constructs";
import * as vm from "..";
import { BaseTestStack } from "../../testing";

const app = new App();

export class exampleAzureLinuxVirtualMachine extends BaseTestStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const clientConfig = new DataAzurermClientConfig(
      this,
      "CurrentClientConfig",
      {},
    );

    new AzurermProvider(this, "azureFeature", {
      features: {},
    });

    const resourceGroup = new ResourceGroup(this, "rg", {
      location: "eastus",
      name: `rg-${this.name}`,
    });

    const vnet = new VirtualNetwork(this, "vnet", {
      name: `vnet-${this.name}`,
      location: resourceGroup.location,
      resourceGroupName: resourceGroup.name,
      addressSpace: ["10.0.0.0/16"],
    });

    const subnet = new Subnet(this, "subnet1", {
      name: "subnet1",
      resourceGroupName: resourceGroup.name,
      virtualNetworkName: vnet.name,
      addressPrefixes: ["10.0.1.0/24"],
    });

    const storage = new StorageAccount(this, "storage", {
      name: `sta${this.name}08l98`,
      resourceGroupName: resourceGroup.name,
      location: resourceGroup.location,
      accountReplicationType: "LRS",
      accountTier: "Standard",
      minTlsVersion: "TLS1_2",
      publicNetworkAccessEnabled: false,
      networkRules: {
        bypass: ["AzureServices"],
        defaultAction: "Deny",
      },
    });

    const linuxVm = new vm.LinuxVM(this, "vm", {
      name: this.name,
      location: "eastus",
      resourceGroup: resourceGroup,
      size: "Standard_B1s",
      adminUsername: "testadmin",
      adminPassword: "Password1234!",
      osDisk: {
        caching: "ReadWrite",
        storageAccountType: "Standard_LRS",
      },
      sourceImageReference: {
        publisher: "Canonical",
        offer: "0001-com-ubuntu-server-jammy",
        sku: "22_04-lts-gen2",
        version: "latest",
      },
      subnet: subnet,
      publicIPAllocationMethod: "Static",
      userData: "#!/bin/bash\nsudo apt-get install -y apache2",
      enableSshAzureADLogin: true,
      identity: {
        type: "SystemAssigned",
      },
      bootDiagnosticsStorageURI: storage.primaryBlobEndpoint,
    });

    // Diag Settings
    linuxVm.addDiagSettings({
      name: "diagsettings",
      storageAccountId: storage.id,
    });

    // RBAC
    linuxVm.addAccess(clientConfig.objectId, "Contributor");

    // Outputs to use for End to End Test
    const cdktfTerraformOutputRGName = new cdktf.TerraformOutput(
      this,
      "resource_group_name",
      {
        value: resourceGroup.name,
      },
    );

    const cdktfTerraformOutputNsgName = new cdktf.TerraformOutput(
      this,
      "vm_name",
      {
        value: linuxVm.name,
      },
    );

    const cdktfTerraformOutputVmsize = new cdktf.TerraformOutput(
      this,
      "vm_size",
      {
        value: "Standard_B1s",
      },
    );

    const cdktfTerraformOutputVmEndpoint = new cdktf.TerraformOutput(
      this,
      "vm_endpoint",
      {
        value: linuxVm.publicIp,
      },
    );

    cdktfTerraformOutputRGName.overrideLogicalId("resource_group_name");
    cdktfTerraformOutputNsgName.overrideLogicalId("vm_name");
    cdktfTerraformOutputVmsize.overrideLogicalId("vm_size");
    cdktfTerraformOutputVmEndpoint.overrideLogicalId("vm_endpoint");
  }
}

new exampleAzureLinuxVirtualMachine(app, "testAzureLinuxVirtualMachineExample");

app.synth();
