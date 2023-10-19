<?php

namespace EdtfDataType\Entity;

use EdtfDataType\Entity\EdtfDataTypeSuper;

/**
 * @Entity
 */

class EdtfDataTypeEdtf extends EdtfDataTypeSuper
{
    /**
     * @Column(type="string", length=255)
     */

    protected $value;

    public function setValue($value)
    {
        $this->value = (int) $value;
    }

    public function getValue()
    {
        return $this->value;
    }
}
